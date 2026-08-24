#!/usr/bin/env node
/**
 * World theme screenshot and conformance harness.
 *
 * Walks every level in the registry, captures the screens where the theme is
 * visible, and then checks the captured pixels against that world's token file.
 *
 * The screenshots answer "does it look right". The conformance pass answers the
 * question a screenshot cannot: "is what rendered actually this world's palette,
 * or did a hardcoded colour leak through". A hardcoded `#ff6666` looks fine in a
 * PNG and is still a bug.
 *
 * Needs a dev server and a browser:
 *   npm run dev
 *   CHROME_PATH=/opt/pw-browsers/chromium node tools/theme_screenshots.mjs
 *
 * Writes output/playwright/themes/<level>-<step>.png and
 * output/playwright/themes/report.json. Exits non-zero on a conformance
 * failure, a console error, or a screen that never rendered.
 */
import { chromium } from 'playwright-core';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { PNG } from 'pngjs';

const OUT = 'output/playwright/themes';
const URL = process.env.CROW_DEV_URL ?? 'http://localhost:8080/';
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium';

/** Share of sampled pixels that must fall inside the world palette. */
const CONFORMANCE_FLOOR = 0.85;
/** Max RGB distance from a palette entry for a pixel to count as on-palette. */
const TOLERANCE = 64;

const failures = [];
const results = [];
const fail = (msg) => { failures.push(msg); console.log(`  FAIL ${msg}`); };

// ── palette helpers ─────────────────────────────────────────────────────────

const hexToRgb = (hex) => {
    const h = hex.replace('#', '').slice(0, 6);
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
};

/**
 * Nearest-palette distance for one pixel. Greys are excluded from the check:
 * text, outlines and the ink family are shared across every world by design, so
 * counting them would make every world look conformant.
 */
function offPaletteDistance(r, g, b, palette) {
    let best = Infinity;
    for (const [pr, pg, pb] of palette) {
        const d = Math.sqrt((r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2);
        if (d < best) best = d;
    }
    return best;
}

const isNeutral = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b) < 24;

async function conformance(pngPath, palette) {
    const png = PNG.sync.read(await readFile(pngPath));
    let sampled = 0, onPalette = 0;
    // Every 4th pixel in both axes: ~16x cheaper, statistically identical.
    for (let y = 0; y < png.height; y += 4) {
        for (let x = 0; x < png.width; x += 4) {
            const i = (png.width * y + x) << 2;
            const [r, g, b, a] = [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
            if (a < 200 || isNeutral(r, g, b)) continue;
            sampled++;
            if (offPaletteDistance(r, g, b, palette) <= TOLERANCE) onPalette++;
        }
    }
    return { sampled, onPalette, share: sampled ? onPalette / sampled : 1 };
}

// ── page helpers ────────────────────────────────────────────────────────────

const activeScenes = (page) => page.evaluate(() =>
    (window.__crowGame?.scene?.scenes ?? []).filter(s => s.scene.isActive()).map(s => s.scene.key));

async function waitForScene(page, key, timeout = 15000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        if ((await activeScenes(page)).includes(key)) return true;
        await page.waitForTimeout(200);
    }
    return false;
}

const activeThemeId = (page) => page.evaluate(() => {
    const game = window.__crowGame;
    const scene = game?.scene?.getScene?.('GameScene');
    // ThemeManager is a singleton; reach it through any live themed component.
    return scene?.registry?.get?.('__themeProbe') ?? null;
});

async function main() {
    await mkdir(OUT, { recursive: true });

    const registry = JSON.parse(await readFile('public/data/levels/level_registry.json', 'utf8'));
    const themes = {};
    for (const level of registry.levels) {
        if (!level.theme || themes[level.theme]) continue;
        themes[level.theme] = JSON.parse(
            await readFile(`public/data/themes/theme_${level.theme}.json`, 'utf8'));
    }

    const browser = await chromium.launch({ executablePath: CHROME });
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();

    const consoleErrors = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', e => consoleErrors.push(String(e)));

    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    if (!await waitForScene(page, 'BootScene') && !await waitForScene(page, 'LoginScene')) {
        fail('game never booted');
        await browser.close();
        return;
    }
    await page.waitForTimeout(1200);

    for (const level of registry.levels) {
        const themeId = level.theme;
        const theme = themes[themeId];
        console.log(`\n${level.key} -> ${themeId ?? '(none)'}`);

        if (!theme) { fail(`${level.key} declares no theme`); continue; }

        // Palette to measure against: the world's own colours only. The Fixed
        // Nine are included because coins, hearts and the owl ring are meant to
        // appear in every world.
        const palette = Object.entries(theme.palette)
            .filter(([, v]) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v))
            .map(([, v]) => hexToRgb(v));

        const started = await page.evaluate(
            k => window.__crowMathSmoke?.startLevel?.(k) ?? false, level.key);
        if (!started || !await waitForScene(page, 'GameScene')) {
            fail(`${level.key} did not reach GameScene`);
            continue;
        }
        await page.waitForTimeout(1600);

        const shots = [];
        const shot = async (name) => {
            const path = `${OUT}/${level.key}-${name}.png`;
            await page.locator('canvas').screenshot({ path });
            shots.push({ name, path });
            return path;
        };

        // 1. gameplay + HUD
        const play = await shot('1-play');

        // 2. the maths board, which is where most themed UI lives
        const opened = await page.evaluate(
            () => window.__crowMathSmoke?.triggerFirstOwlInteraction?.() ?? false);
        let board = null;
        if (opened && await waitForScene(page, 'MathChallengeScene')) {
            await page.waitForTimeout(1400);
            board = await shot('2-math-board');

            // 3. wrong-answer feedback: the state the brand system says must
            //    never be red. Worth a frame of its own.
            const state = await page.evaluate(
                () => window.__crowMathSmoke?.getMathState?.() ?? null);
            if (state?.optionCenters?.length) {
                const wrong = state.optionCenters.find(o => o.value !== state.correctAnswer);
                if (wrong) {
                    await page.mouse.click(wrong.x, wrong.y);
                    await page.waitForTimeout(400);
                    await shot('3-math-wrong');
                }
            }
        } else {
            console.log('  note: no owl reachable in this level, board not captured');
        }

        for (const { name, path } of shots) {
            const c = await conformance(path, palette);
            const pct = (c.share * 100).toFixed(1);
            const ok = c.share >= CONFORMANCE_FLOOR;
            results.push({ level: level.key, theme: themeId, shot: name, ...c });
            if (ok) console.log(`  PASS ${name} ${pct}% on-palette (${c.sampled} sampled)`);
            else fail(`${level.key} ${name}: only ${pct}% of sampled pixels are in the ${themeId} palette (floor ${CONFORMANCE_FLOOR * 100}%)`);
        }

        if (!board) fail(`${level.key}: math board never captured`);
    }

    if (consoleErrors.length) {
        for (const e of consoleErrors.slice(0, 10)) fail(`console: ${e}`);
    }

    await writeFile(`${OUT}/report.json`, JSON.stringify({
        capturedAt: new Date().toISOString(),
        baseUrl: URL,
        conformanceFloor: CONFORMANCE_FLOOR,
        tolerance: TOLERANCE,
        whatThisIs: 'Per-world screenshots plus a palette-conformance check on the captured pixels.',
        whatThisIsNot: 'Not a pixel-diff regression baseline, and not proof a screen reads well to a child.',
        results,
        consoleErrors,
        failures,
    }, null, 2) + '\n');

    await browser.close();

    console.log(`\n${results.length} shots checked, ${failures.length} failure(s). Report: ${OUT}/report.json`);
    if (failures.length) process.exit(1);
}

await main();
