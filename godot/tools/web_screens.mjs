/**
 * Screen tour of the exported web build: log in, play, pause, and photograph
 * every screen on the way, at more than one viewport.
 *
 * WHY THIS IS SEPARATE FROM web_boot_smoke.mjs. That one is a GATE: it proves
 * the export boots and that walking the screens produces no console error, and
 * it must stay fast and deterministic. This is a LOOKING tool. It answers "what
 * does this actually look like right now", which is the question that found the
 * UI being cut off on every 16:9 display, and it cannot fail a build because a
 * screenshot cannot fail a build.
 *
 * The viewport list is the point. `stretch/aspect=expand` in project.godot means
 * the viewport is never smaller than 960x540 -- and on any display at 16:9 or
 * wider it is EXACTLY 540 tall, because expand grows the roomier axis and leaves
 * the other at the base. Every centred column in this game is taller than 540.
 * So a screen that looks right on the owner's iPad can be cut on a laptop, which
 * has happened, which is why FitBox exists. Shooting both is how you see it.
 *
 * Usage:
 *   node godot/tools/web_screens.mjs [--port 8062] [--out <dir>] [--keep]
 *
 * Writes <out>/<viewport>/NN-step.png. Default out is output/playwright/screens.
 */
import { existsSync } from 'fs';
import { spawn } from 'child_process';
import { mkdir } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const WEB_DIR = resolve(ROOT, 'output/web');
const arg = (name, fallback) => {
    const i = process.argv.indexOf(name);
    return i === -1 ? fallback : process.argv[i + 1];
};
const PORT = Number(arg('--port', 8062));
const OUT = resolve(ROOT, arg('--out', 'output/playwright/screens'));

/**
 * The two that matter, and why each is here.
 *
 * `laptop` is the tightest viewport this game can ever be given and the one
 * nobody plays on while developing. `ipad` is the owner's actual device. A
 * screen has to be right on both or the fitter is not doing its job.
 */
const VIEWPORTS = [
    { name: 'laptop-960x540', width: 960, height: 540 },
    { name: 'ipad-1180x820', width: 1180, height: 820 },
];

const EXECUTABLE_CANDIDATES = [
    process.env.CHROMIUM_PATH,
    '/opt/pw-browsers/chromium',
    '/opt/pw-browsers/chromium-1091/chrome-linux/chrome',
].filter(Boolean);
const resolveChromium = () => EXECUTABLE_CANDIDATES.find(existsSync);

/**
 * The walk, as steps that each end in a screenshot.
 *
 * Blind clicks at the canvas centre, deliberately: coordinate-precise clicking
 * is what makes browser tests break on every layout change, and the point here
 * is to reach each screen, not to assert a layout. What varies between builds is
 * WHICH screen a centre click opens, so every step is photographed and a human
 * reads the result.
 */
function walk(page, view) {
    const mid = { x: view.width / 2, y: view.height / 2 };
    const click = (dx = 0, dy = 0) => page.mouse.click(mid.x + dx, mid.y + dy);
    /** Click the centre of the column at a fraction of the viewport height. */
    const at = (fraction) => page.mouse.click(mid.x, view.height * fraction);
    return [
        // The canvas has to hold DOM focus before any key reaches Godot, and a
        // click is the only thing that gives it. This one lands between the
        // title and the button on purpose: it focuses and presses nothing.
        ['boot', async () => { await click(0, -80); }],
        // No profiles on a fresh browser, so the login screen's one primary
        // action is "New player".
        ['new-player', async () => click(0, 60)],
        // CLICK each field. Tab does NOT work here: the browser owns Tab and
        // moves DOM focus off the canvas, so a tabbed walk types the PIN into
        // the name box -- which is exactly what the first version of this file
        // photographed. Fractions of the viewport, because the column is
        // centred and the two viewports are different heights.
        ['name', async () => { await at(0.26); await page.keyboard.type('Hormann'); }],
        ['pin', async () => { await at(0.46); await page.keyboard.type('1234'); }],
        ['pin-again', async () => { await at(0.66); await page.keyboard.type('1234'); }],
        // The Create button is BELOW THE FOLD at 960x540 -- the form is four
        // rows and a title, and the viewport is 540 tall. The login column is a
        // ScrollContainer, so a wheel reaches it; a five-year-old's parent has
        // to work that out for themselves, which is worth fixing separately.
        ['scrolled', async () => { await page.mouse.wheel(0, 500); }],
        ['signed-in', async () => { await at(0.78); await page.waitForTimeout(1500); }],
        ['main-menu', async () => page.waitForTimeout(800)],
        // Play is the primary row and now resumes straight into a level.
        ['playing', async () => { await click(0, -40); await page.waitForTimeout(3000); }],
        // THE SCREEN THIS TOOL WAS WRITTEN FOR. `pause` is bound to Escape.
        ['paused', async () => { await page.keyboard.press('Escape'); }],
    ];
}

async function shoot(view) {
    const dir = resolve(OUT, view.name);
    await mkdir(dir, { recursive: true });
    const browser = await chromium.launch({ executablePath: resolveChromium() });
    const errors = [];
    try {
        const context = await browser.newContext({
            viewport: { width: view.width, height: view.height },
            hasTouch: true,
        });
        const page = await context.newPage();
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 120_000 });
        await page.waitForFunction(() => {
            const c = document.querySelector('canvas');
            return c && c.width > 0 && c.height > 0;
        }, { timeout: 180_000 });
        await page.waitForTimeout(9000);

        let step = 0;
        for (const [label, act] of walk(page, view)) {
            await act();
            await page.waitForTimeout(1800);
            step += 1;
            const file = `${String(step).padStart(2, '0')}-${label}.png`;
            await page.screenshot({ path: resolve(dir, file) });
            console.log(`  ${view.name}/${file}`);
        }
    } finally {
        await browser.close();
    }
    return errors;
}

const server = spawn('python3', ['-m', 'http.server', String(PORT)], {
    cwd: WEB_DIR, stdio: 'ignore',
});
process.on('exit', () => server.kill());

try {
    await new Promise(r => setTimeout(r, 700));
    const allErrors = [];
    for (const view of VIEWPORTS) {
        console.log(`\n${view.name}:`);
        allErrors.push(...await shoot(view));
    }
    console.log(`\nScreens written to ${OUT}`);
    if (allErrors.length > 0) {
        console.log(`\n${allErrors.length} console error(s) seen while walking:`);
        for (const e of allErrors.slice(0, 10)) console.log(`  ${e}`);
    }
} finally {
    server.kill();
}
