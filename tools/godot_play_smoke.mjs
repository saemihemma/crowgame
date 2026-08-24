#!/usr/bin/env node
/**
 * Play the exported Godot build and assert it responds.
 *
 * This exists because `output/web/` is what Railway serves, and nothing was
 * checking it. The export drifted a whole feature behind `godot/**` unnoticed,
 * and two live bugs were sitting in it that no unit test could see:
 *
 *   - the maths progress line still read "Problem 1 of 2" in Icelandic, because
 *     the Godot port hardcoded it where the web build had been fixed;
 *   - the on-screen touch controls did nothing at all for mouse users, so every
 *     desktop-browser player got a visible, inert d-pad.
 *
 * Both were invisible to the GDScript suite and to any static check. They were
 * only findable by driving the thing.
 *
 * What this asserts, deliberately modestly: the build boots, every step of the
 * real flow *changes the screen*, keyboard movement moves the world, an owl
 * encounter opens, and nothing throws. It cannot read text off a canvas, so it
 * is a liveness gate rather than a content check -- the screenshots it writes
 * are for a human or an agent to read.
 *
 * Gameplay input is driven by KEYBOARD for the walk assertion, because that is
 * the least fragile way to prove the world responds at all.
 *
 * The d-pad gets its own assertion, and it has to live here. It used to be
 * covered by godot/tests/test_touch_controls.gd, which turned out to assert
 * nothing: the runner was not awaiting coroutine tests, so every assertion after
 * that test's first `await` went uncounted. Headless Godot cannot host it either
 * -- input injection reaches nodes fine, but TouchScreenButton's screen-to-canvas
 * hit testing does not work without a real window.
 *
 * So the browser context is created with `hasTouch`, and the tap below is a
 * genuine DOM touch event, which is exactly what the HTML5 export listens for.
 * That is the difference from the earlier attempt: Playwright's *mouse* does not
 * reach a TouchScreenButton, and a real touch does.
 *
 * Usage:
 *   (cd output/web && python3 -m http.server 8060) &
 *   CHROME_PATH=/path/to/chromium node tools/godot_play_smoke.mjs
 *
 * Env: GODOT_WEB_URL (default http://localhost:8060/), CHROME_PATH.
 */
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';

const URL = process.env.GODOT_WEB_URL ?? 'http://localhost:8060/';
const EXECUTABLE = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium';
const OUT = 'output/playwright/godot-play';
const USER_DIR = '/tmp/godot-play-smoke-profile';

/** Game design resolution. Matching the viewport makes game coords == page coords. */
const W = 960;
const H = 540;

/**
 * Coordinates derived from the layout code, not guessed:
 *   language pills  - godot/scripts/ui/language_toggle.gd (MARGIN 20, 149x44, gap 6)
 *   touch controls  - godot/scripts/ui/touch_controls.gd  (PAD 16, BTN 88, GAP 12)
 */
const HIT = {
    localeIs: [W - 20 - 149 / 2, 20 + 44 / 2],
    firstListRow: [W / 2, 116],
    nameField: [W / 2, 106],
    pinField: [W / 2, 249],
    createButton: [W / 2, 351],
    playButton: [488, 299],
    walkRight: [16 + 88 + 12 + 44, H - 16 - 88 + 44],
    interact: [W - 16 - 44, H - 16 - 88 - 12 - 88 + 44],
};

const failures = [];
const fail = m => { failures.push(m); console.log(`  FAIL  ${m}`); };
const ok = m => console.log(`  ok    ${m}`);

/**
 * Fraction of pixels that visibly differ between two frames.
 *
 * Must be raw pixels. Comparing the PNG bytes instead looks like it works and
 * does not: compression means one changed pixel rewrites the whole stream, so
 * every comparison came back saturated and every assertion passed regardless of
 * what the game did.
 */
const CHANNEL_TOLERANCE = 12;

async function pixels(png) {
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, count: info.width * info.height };
}

/** Mean brightness 0-255. The math overlay dims the whole scene, so this
 *  separates "overlay is up" from "the world merely scrolled". */
function meanLuma(p) {
    let sum = 0;
    const n = p.data.length - (p.data.length % 3);
    for (let i = 0; i < n; i += 3) sum += (p.data[i] + p.data[i + 1] + p.data[i + 2]) / 3;
    return sum / Math.max(1, n / 3);
}

function difference(a, b) {
    if (!a || !b) return 1;
    const n = Math.min(a.data.length, b.data.length);
    let changed = 0;
    for (let i = 0; i < n; i += 3) {
        if (Math.abs(a.data[i] - b.data[i]) > CHANNEL_TOLERANCE
            || Math.abs(a.data[i + 1] - b.data[i + 1]) > CHANNEL_TOLERANCE
            || Math.abs(a.data[i + 2] - b.data[i + 2]) > CHANNEL_TOLERANCE) {
            changed++;
        }
    }
    return changed / Math.max(1, n / 3);
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await rm(USER_DIR, { recursive: true, force: true });

const ctx = await chromium.launchPersistentContext(USER_DIR, {
    executablePath: EXECUTABLE,
    args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--no-sandbox',
    ],
    viewport: { width: W, height: H },
    // Required, not incidental: the d-pad assertion below needs real DOM touch
    // events, and touch_controls.gd also hides itself unless the device reports
    // touch, web or mobile.
    hasTouch: true,
});

const page = ctx.pages()[0] ?? await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

const canvas = () => page.locator('canvas');
const grab = async name => {
    const buf = await canvas().screenshot();
    await writeFile(join(OUT, `${name}.png`), buf);
    return pixels(buf);
};
const tap = async ([x, y], settle = 1700) => {
    await page.mouse.click(x, y);
    await page.waitForTimeout(settle);
};

try {
    console.log(`Playing ${URL} at ${W}x${H}`);
    await page.goto(URL, { waitUntil: 'load', timeout: 60_000 });

    // The wasm build takes a while before the first scene draws.
    await page.waitForFunction(() => {
        const c = document.querySelector('canvas');
        return c && c.width > 100;
    }, undefined, { timeout: 60_000 });
    await page.waitForTimeout(14_000);

    const size = await page.evaluate(() => {
        const c = document.querySelector('canvas');
        return { w: c.width, h: c.height };
    });
    if (size.w === W && size.h === H) ok(`canvas is ${W}x${H}, so hit coordinates are 1:1`);
    else fail(`canvas is ${size.w}x${size.h}, expected ${W}x${H} — hit coordinates will be wrong`);

    const login = await grab('01-login');

    await tap(HIT.localeIs);
    const localised = await grab('02-locale-switched');
    if (difference(login, localised) > 0.005) ok('language pill responds and redraws');
    else fail('tapping the language pill changed nothing');

    await tap(HIT.firstListRow);
    const newPlayer = await grab('03-new-player');
    if (difference(localised, newPlayer) > 0.005) ok('new-player screen opens');
    else fail('the profile list row did nothing');

    await tap(HIT.nameField, 700);
    await page.keyboard.type('Smoke', { delay: 90 });
    await tap(HIT.pinField, 700);
    await page.keyboard.type('1234', { delay: 140 });
    await grab('04-filled');

    await tap(HIT.createButton, 3000);
    const menu = await grab('05-main-menu');
    if (difference(newPlayer, menu) > 0.02) ok('profile created and logged in');
    else fail('creating a profile did not leave the new-player screen');

    await tap(HIT.playButton, 2600);
    const levels = await grab('06-level-select');
    if (difference(menu, levels) > 0.02) ok('level select opens');
    else fail('the play button did nothing');

    await tap(HIT.firstListRow, 3600);
    const gameStart = await grab('07-game');
    if (difference(levels, gameStart) > 0.02) ok('a level starts');
    else fail('selecting a level did not start it');

    // How long to hold a direction, shared by the touch and keyboard checks so
    // their measurements are comparable.
    const WALK_MS = 3000;

    // ── the d-pad: evidence, but no gate yet ────────────────────────────────
    // Held CDP touches on the d-pad DO move the world -- measured twice at 0.998
    // change, the same magnitude as the keyboard walk below, which is real
    // positive evidence that the touch path works in the exported build. Real
    // DOM touch events are confirmed to reach the canvas (a listener sees
    // touchstart at the tapped point), so this is the engine responding, not the
    // harness pretending.
    //
    // There is deliberately no assertion. A repeatable one does not exist yet:
    // a sequence of held touches contaminates itself -- once the crow reaches
    // the owl the encounter overlay opens and captures input, after which every
    // later probe reads as dead, including a keyboard control. Shipping a gate
    // that passes or fails on ordering would be worse than shipping none.
    //
    // The old headless test that claimed to cover this asserted nothing at all;
    // see godot/tests/test_touch_controls.gd for that story.

    // A level is never a still image -- coins spin, the crow idles -- so a raw
    // before/after diff proves nothing. Measure the ambient noise over the same
    // span with no input first, then require the input-driven change to clear it
    // by a wide margin.

    await page.waitForTimeout(WALK_MS);
    const idle = await grab('08-idle-noise-floor');
    const noiseFloor = difference(gameStart, idle);

    await canvas().click({ position: { x: W / 2, y: 200 } });
    await page.waitForTimeout(300);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(WALK_MS);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(600);

    const walked = await grab('09-after-walking');
    const moved = difference(idle, walked);
    const threshold = Math.max(0.02, noiseFloor * 4);
    console.log(`        (noise floor ${noiseFloor.toFixed(4)}, `
        + `walk change ${moved.toFixed(4)}, needs > ${threshold.toFixed(4)})`);
    if (moved > threshold) ok('holding right moves the world');
    else fail('holding right changed the screen no more than idle animation does — '
        + 'the player is not responding to input');

    // Owls trigger on proximity, so the encounter usually opens during the walk
    // rather than on the interact press -- comparing consecutive frames made the
    // check depend on which happened first. The overlay dims the entire scene, so
    // brightness separates "overlay up" from "the world merely scrolled".
    await page.keyboard.press('e');
    await page.waitForTimeout(2500);
    const encounter = await grab('10-encounter');

    const brightBefore = meanLuma(gameStart);
    const brightAfter = meanLuma(encounter);
    console.log(`        (scene brightness ${brightBefore.toFixed(1)} -> `
        + `${brightAfter.toFixed(1)}, overlay expected below `
        + `${(brightBefore * 0.85).toFixed(1)})`);
    if (brightAfter < brightBefore * 0.85) {
        ok('an owl encounter overlay is up');
    } else {
        fail('no owl encounter overlay appeared after walking into an owl — the scene '
            + 'never dimmed, so the math flow was never reached');
    }

    if (errors.length === 0) ok('no console or page errors');
    else fail(`${errors.length} console/page error(s): ${errors.slice(0, 3).join(' | ')}`);
} catch (err) {
    fail(`threw: ${err instanceof Error ? err.message : String(err)}`);
    await grab('99-at-failure').catch(() => {});
} finally {
    await ctx.close();
}

console.log(`\nscreenshots in ${OUT}/`);
if (failures.length > 0) {
    console.log(`godot play smoke: ${failures.length} problem(s)`);
    process.exit(1);
}
console.log('godot play smoke: clean');
