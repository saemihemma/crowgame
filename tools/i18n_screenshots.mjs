#!/usr/bin/env node
/**
 * Locale screenshot harness — drives the real login flow in each shipped locale
 * and captures the screens where translated text meets a fixed-pixel box.
 *
 * Exists because the fit budget in tools/validate_i18n.mjs is arithmetic: it
 * proves a string is narrow enough, not that the screen reads well. These shots
 * are the visual half of that evidence, and they are what caught the login Back
 * button sitting below the canvas and the level name touching the padlock.
 *
 * Needs a dev server (npm run dev) and a browser:
 *   CHROME_PATH=/path/to/chromium CROW_DEV_URL=http://localhost:8080/ \
 *     node tools/i18n_screenshots.mjs
 *
 * Writes output/playwright/i18n/<locale>-<step>.png
 */
import { chromium } from 'playwright-core';
import { mkdir } from 'fs/promises';

const OUT = 'output/playwright/i18n';
const URL = process.env.CROW_DEV_URL ?? 'http://localhost:8080/';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium',
});

/** Convert game coordinates (960x540 design space) to page coordinates. */
async function gamePoint(page, gx, gy) {
    return page.evaluate(({ gx, gy }) => {
        const c = document.querySelector('canvas');
        const r = c.getBoundingClientRect();
        const g = window.__crowGame;
        const w = g?.scale?.gameSize?.width ?? 960;
        const h = g?.scale?.gameSize?.height ?? 540;
        return { x: r.left + (gx / w) * r.width, y: r.top + (gy / h) * r.height };
    }, { gx, gy });
}

async function tap(page, gx, gy, settle = 700) {
    const p = await gamePoint(page, gx, gy);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(settle);
}

async function activeScenes(page) {
    return page.evaluate(() =>
        (window.__crowGame?.scene?.scenes ?? [])
            .filter(s => s.scene.isActive())
            .map(s => s.scene.key));
}

async function waitForScene(page, key, timeout = 15000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        if ((await activeScenes(page)).includes(key)) return true;
        await page.waitForTimeout(250);
    }
    return false;
}

for (const locale of ['en', 'is']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.evaluate(l => localStorage.setItem('crow_locale', l), locale);
    await page.reload({ waitUntil: 'domcontentloaded' });

    await waitForScene(page, 'LoginScene');
    await page.waitForTimeout(1400);
    const shot = (name) => page.locator('canvas').screenshot({ path: `${OUT}/${locale}-${name}.png` });

    await shot('1-login-userlist');

    // "+ New User" with no profiles yet: startY 180 + 12
    await tap(page, 480, 192, 900);
    await page.fill('input[type=text]', 'Ada');
    await page.waitForTimeout(300);
    await shot('2-login-newuser');

    // GO!
    await tap(page, 480, 280, 900);
    await waitForScene(page, 'LoginScene');
    await page.waitForTimeout(600);

    // Three of four digits, so filled and empty dots are both visible.
    await tap(page, 396, 186, 250);
    await tap(page, 480, 186, 250);
    await tap(page, 564, 186, 400);
    await shot('3-login-pin-dots');

    // Fourth digit -> confirm, then repeat the PIN to log in.
    await tap(page, 396, 270, 900);
    for (const [x, y] of [[396,186],[480,186],[564,186],[396,270]]) await tap(page, x, y, 250);
    await page.waitForTimeout(1800);

    if (await waitForScene(page, 'MainMenuScene')) {
        await page.waitForTimeout(1300);
        await shot('4-mainmenu');
        // PLAY -> level select (level names + the drawn padlock)
        await tap(page, 480, 540 - 148, 400);
        if (await waitForScene(page, 'LevelSelectScene')) {
            await page.waitForTimeout(1200);
            await shot('5-levelselect');
        }
    } else {
        console.log(`[${locale}] did not reach MainMenuScene; active:`, await activeScenes(page));
    }

    console.log(`[${locale}] done`);
    await context.close();
}
await browser.close();
