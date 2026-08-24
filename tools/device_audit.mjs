#!/usr/bin/env node
/**
 * Device gate audit — the measuring half of brand/PRODUCTION_PLAN.md section 1.
 *
 * Opens the game at each landscape device profile and measures the gates that a
 * screenshot cannot show: how much of the screen the canvas actually fills, how
 * big the touch targets are, whether anything sits in the safe area, whether a
 * thumb can reach the controls, and how long until a child can press something.
 *
 * Everything is measured from the LIVE scene graph, never from source, because
 * source says what was intended and the scene graph says what shipped.
 *
 *   npm run dev
 *   CHROME_PATH=/opt/pw-browsers/chromium node tools/device_audit.mjs
 *
 * Writes output/playwright/device-audit/report.json and one shot per profile.
 * Exits non-zero when a gate fails, which today it should.
 */
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'fs/promises';

const URL = process.env.CROW_DEV_URL ?? 'http://localhost:8080/';
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium';
const OUT = 'output/playwright/device-audit';

const DEVICES = [
    { id: 'ipad',    label: 'iPad landscape',      width: 1180, height: 820,  dpr: 2, touch: true },
    { id: 'phone',   label: 'iPhone 15 landscape', width: 852,  height: 393,  dpr: 3, touch: true },
    { id: 'desktop', label: 'Desktop 1080p',       width: 1920, height: 1080, dpr: 1, touch: false },
];

/** brand/PRODUCTION_PLAN.md section 1. */
const GATES = {
    B1_maxLetterboxPct: 8,
    B3_minTouchTargetPx: 64,
    B3_minPrimaryTargetPx: 80,
    B3_minGapPx: 12,
    B4_safeAreaPx: 32,
    B5_maxTimeToInputMs: 3000,
    /**
     * Two tiers, because the bible's rule is "nothing a child MUST read" - text
     * that only confirms something the UI already says visually is held to a
     * lower floor. Mark it with `setData('redundant', true)`; anything unmarked
     * is treated as essential.
     */
    B7_minEssentialTextPx: 24,
    B7_minAnyTextPx: 16,
    /** Reach arc from either bottom corner, in CSS px on the device. */
    B10_thumbReachPx: 620,
};

const results = [];
const failures = [];
const fail = (device, gate, detail) => {
    failures.push({ device, gate, detail });
    console.log(`  FAIL ${gate}  ${detail}`);
};

async function auditDevice(browser, device) {
    console.log(`\n${device.label}  ${device.width}x${device.height} @${device.dpr}x`);

    const context = await browser.newContext({
        viewport: { width: device.width, height: device.height },
        deviceScaleFactor: device.dpr,
        hasTouch: device.touch,
        isMobile: device.touch,
    });
    const page = await context.newPage();

    const t0 = Date.now();
    await page.goto(URL, { waitUntil: 'domcontentloaded' });

    // B5: time until a child can press something. That is the first INTERACTIVE
    // scene, not the first frame - the loading screen accepts nothing.
    //
    // `scene.scenes.length` is truthy from construction, so it is not a
    // readiness signal: waiting on it jumps into a level before BootScene has
    // registered any theme, and the sky gradient throws.
    await page.waitForFunction(
        () => (window.__crowGame?.scene?.scenes ?? []).some(
            s => ['LoginScene', 'MainMenuScene'].includes(s.scene.key) && s.scene.isActive()),
        undefined,
        { timeout: 20000 },
    );
    const timeToInput = Date.now() - t0;

    // Now jump into gameplay for the layout gates.
    await page.evaluate(() => window.__crowMathSmoke?.startLevel('level_01'));
    await page.waitForFunction(
        () => (window.__crowGame?.scene?.scenes ?? [])
            .some(s => s.scene.key === 'HUDScene' && s.scene.isActive()),
        undefined,
        { timeout: 20000 },
    );
    await page.waitForTimeout(1200);

    const measured = await page.evaluate((g) => {
        const game = window.__crowGame;
        const canvas = game.canvas.getBoundingClientRect();

        // B1: how much of the screen the game actually occupies.
        const letterboxPct = 100 * (1 - (canvas.width * canvas.height)
            / (window.innerWidth * window.innerHeight));

        // Scale from the game's design space to CSS pixels on this device.
        const scale = canvas.width / game.scale.gameSize.width;
        const toCss = (n) => n * scale;

        const hud = game.scene.getScene('HUDScene');
        const targets = [];
        const texts = [];

        const walk = (obj, sceneKey) => {
            if (!obj) return;
            if (Array.isArray(obj.list)) {
                for (const child of obj.list) walk(child, sceneKey);
            }
            if (obj.type === 'Text' && obj.text) {
                texts.push({
                    scene: sceneKey,
                    text: String(obj.text).slice(0, 24),
                    sizePx: parseFloat(obj.style?.fontSize ?? '0'),
                    redundant: Boolean(obj.getData?.('redundant')),
                });
            }
            // Interactive things carry an input hit area.
            if (obj.input?.hitArea) {
                const h = obj.input.hitArea;
                const m = obj.getWorldTransformMatrix?.();
                targets.push({
                    scene: sceneKey,
                    w: h.width ?? 0,
                    h: h.height ?? 0,
                    x: m ? m.tx : (obj.x ?? 0),
                    y: m ? m.ty : (obj.y ?? 0),
                });
            }
        };

        for (const scene of game.scene.scenes) {
            if (scene.scene.isActive()) walk(scene.children, scene.scene.key);
        }
        void hud;

        return {
            letterboxPct,
            canvas: { w: canvas.width, h: canvas.height },
            viewport: { w: window.innerWidth, h: window.innerHeight },
            scale,
            gameSize: { w: game.scale.gameSize.width, h: game.scale.gameSize.height },
            targets: targets.map(t => ({ ...t, cssW: toCss(t.w), cssH: toCss(t.h) })),
            texts,
            safeAreaGamePx: g.B4_safeAreaPx / scale,
        };
    }, GATES);

    // ── gates ──────────────────────────────────────────────────────────────
    if (measured.letterboxPct > GATES.B1_maxLetterboxPct) {
        fail(device.id, 'B1 letterbox',
            `${measured.letterboxPct.toFixed(1)}% of the screen is not the game (max ${GATES.B1_maxLetterboxPct}%)`);
    } else {
        console.log(`  PASS B1 letterbox ${measured.letterboxPct.toFixed(1)}%`);
    }

    if (device.touch) {
        const small = measured.targets.filter(t => Math.min(t.cssW, t.cssH) < GATES.B3_minTouchTargetPx);
        if (small.length) {
            fail(device.id, 'B3 touch target',
                `${small.length} target(s) under ${GATES.B3_minTouchTargetPx}px, smallest ${Math.min(...small.map(t => Math.min(t.cssW, t.cssH))).toFixed(0)}px`);
        } else if (measured.targets.length) {
            console.log(`  PASS B3 touch targets (${measured.targets.length} checked)`);
        } else {
            fail(device.id, 'B3 touch target', 'no interactive targets found in the scene graph');
        }

        // B4: nothing interactive inside the safe area, measured in game space.
        const inset = measured.safeAreaGamePx;
        const edge = measured.targets.filter(t =>
            t.x - t.w / 2 < inset ||
            t.y - t.h / 2 < inset ||
            t.x + t.w / 2 > measured.gameSize.w - inset ||
            t.y + t.h / 2 > measured.gameSize.h - inset);
        if (edge.length) {
            fail(device.id, 'B4 safe area',
                `${edge.length} interactive object(s) within ${GATES.B4_safeAreaPx}px of an edge`);
        } else if (measured.targets.length) {
            console.log('  PASS B4 safe area');
        }

        // B10: reach. Gameplay controls must sit inside an arc from a bottom corner.
        const reachGame = GATES.B10_thumbReachPx / measured.scale;
        const unreachable = measured.targets.filter(t => {
            const dl = Math.hypot(t.x, measured.gameSize.h - t.y);
            const dr = Math.hypot(measured.gameSize.w - t.x, measured.gameSize.h - t.y);
            return Math.min(dl, dr) > reachGame;
        });
        if (unreachable.length) {
            fail(device.id, 'B10 reach',
                `${unreachable.length} control(s) outside a ${GATES.B10_thumbReachPx}px thumb arc`);
        } else if (measured.targets.length) {
            console.log('  PASS B10 reach');
        }
    }

    if (timeToInput > GATES.B5_maxTimeToInputMs) {
        fail(device.id, 'B5 time to input', `${timeToInput}ms (max ${GATES.B5_maxTimeToInputMs}ms)`);
    } else {
        console.log(`  PASS B5 time to input ${timeToInput}ms`);
    }

    const tooSmall = measured.texts.filter(t => t.sizePx > 0 && t.sizePx < GATES.B7_minAnyTextPx);
    const essentialTooSmall = measured.texts.filter(
        t => t.sizePx > 0 && !t.redundant && t.sizePx < GATES.B7_minEssentialTextPx);
    const describe = ts => ts.slice(0, 4).map(t => `"${t.text}"@${t.sizePx}`).join(', ');

    if (tooSmall.length) {
        fail(device.id, 'B7 text floor',
            `${tooSmall.length} under the ${GATES.B7_minAnyTextPx}px hard floor: ${describe(tooSmall)}`);
    }
    if (essentialTooSmall.length) {
        fail(device.id, 'B7 essential text',
            `${essentialTooSmall.length} readable-meaning text under ${GATES.B7_minEssentialTextPx}px: ${describe(essentialTooSmall)}`);
    }
    if (!tooSmall.length && !essentialTooSmall.length && measured.texts.length) {
        console.log(`  PASS B7 text size (${measured.texts.length} checked)`);
    }

    await page.screenshot({ path: `${OUT}/${device.id}.png` });
    results.push({ device: device.id, label: device.label, timeToInput, ...measured });
    await context.close();
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME });
for (const device of DEVICES) await auditDevice(browser, device);
await browser.close();

await writeFile(`${OUT}/report.json`, JSON.stringify({
    capturedAt: new Date().toISOString(),
    gates: GATES,
    whatThisIs: 'Device-profile measurement of the B1-B10 gates in brand/PRODUCTION_PLAN.md, read from the live scene graph.',
    whatThisIsNot: 'Not a frame-budget trace (B2), not a reduced-motion check (B9), and not a substitute for looking at the screenshots.',
    results,
    failures,
}, null, 2) + '\n');

console.log(`\n${failures.length} gate failure(s) across ${DEVICES.length} profiles. Report: ${OUT}/report.json`);
if (failures.length) process.exit(1);
