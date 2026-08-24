#!/usr/bin/env node
/**
 * Drive the Pause settings and prove the live surfaces re-render.
 *
 * Pause is the only settings surface reachable mid-level, and it is what made
 * mid-game language switching possible. The roadmap had claimed that switching
 * inside a level "would require live re-rendering of HUDScene, TouchControls,
 * DialogBox and any open MathChallengeScene overlay -- a scene restart is only
 * safe outside gameplay". That was wrong: seven components already re-render in
 * place on THEME_CHANGED, so locale needed the same treatment on the same bus,
 * not a new mechanism.
 *
 * WHAT THIS ASSERTS, AND WHY EACH ONE EXISTS
 * -----------------------------------------
 *  - The Pause panel's own four rows change language. It is the surface doing
 *    the switching, so it is the one place that has to repaint itself.
 *  - The touch control labels change language WITHOUT the scene restarting.
 *    That is the whole claim. JUMP/STÖKK, PECK/GOGGA and ZAP/SKOT differ, so if
 *    the subscription were missing the d-pad would keep the old language.
 *  - GameScene is the same scene instance before and after. A restart would
 *    "work" visually and throw the level away underneath the child.
 *  - The theme toggle fires without error. On the web the THEME_CHANGED path was
 *    fully built with seven subscribers and never once triggered at runtime,
 *    because setTheme was only ever called at boot. This is the first thing that
 *    exercises it.
 *
 * Touch emulation is required, not incidental: TouchControls hides itself on a
 * non-touch device and its rebuild is guarded on visibility, so without
 * hasTouch the labels never exist and the central assertion would vacuously
 * pass.
 *
 * Usage: CROW_DEV_URL=http://localhost:8080/ node tools/pause_settings_check.mjs
 */
import { chromium } from 'playwright-core';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';

const URL = process.env.CROW_DEV_URL ?? 'http://localhost:8080/';
const EXECUTABLE = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium';
const OUT = 'output/playwright/pause-settings';

const failures = [];
const fail = m => { failures.push(m); console.log(`  FAIL  ${m}`); };
const ok = m => console.log(`  ok    ${m}`);

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const ctx = await chromium.launchPersistentContext('/tmp/crow-pause-settings', {
    executablePath: EXECUTABLE,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
    viewport: { width: 960, height: 540 },
    hasTouch: true,
    isMobile: false,
});

const page = ctx.pages()[0] ?? await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

/** Every rendered string, per active scene, read off the live display list. */
const readScreen = () => page.evaluate(() => {
    const game = window.__crowGame;
    const per = {};
    const rows = [];
    const walk = list => {
        for (const o of list) {
            if (o.type === 'Text' && o.text) {
                rows.push({ text: o.text, cy: Math.round(o.getBounds().centerY) });
            }
            if (o.list) walk(o.list);
        }
    };
    for (const s of game.scene.scenes) {
        if (!s.sys.settings.active) continue;
        rows.length = 0;
        walk(s.children.list);
        per[s.sys.settings.key] = rows.map(r => r.text);
    }
    return per;
});

const flat = screen => Object.values(screen).flat();

try {
    console.log(`Driving Pause settings at ${URL}`);
    await page.goto(URL, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForFunction(() => Boolean(window.__crowMathSmoke), undefined, { timeout: 45_000 });
    await page.evaluate(() => {
        for (const key of Object.keys(localStorage)) {
            if (key.startsWith('crow_')) localStorage.removeItem(key);
        }
        localStorage.setItem('crow_locale', 'en');
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.__crowMathSmoke), undefined, { timeout: 45_000 });
    await page.waitForTimeout(2500);

    await page.evaluate(() => window.__crowMathSmoke?.startLevel('level_01'));
    await page.waitForFunction(
        () => Boolean(window.__crowGame?.scene?.isActive?.('GameScene')),
        undefined, { timeout: 30_000 },
    );
    await page.waitForTimeout(2500);

    // TouchControls lives on HUDScene, so the generic display-list walk already
    // reaches its labels -- no reaching into private fields. The counters read
    // "x0" in both locales by design, so they are filtered out: only the button
    // labels can demonstrate a language change here.
    const touchLabels = async () => {
        const hud = (await readScreen()).HUDScene ?? [];
        return hud.filter(t => !/^[x+]\d/.test(t));
    };

    const beforeTouch = await touchLabels();
    if (beforeTouch.length === 0) {
        fail('no touch-control labels on the HUD — hasTouch emulation did not apply '
            + '(TouchControls hides on a non-touch device and guards its rebuild on '
            + 'visibility), so the central assertion would pass vacuously');
    } else {
        ok(`touch controls are up with labels: ${beforeTouch.join(' ')}`);
    }

    const sceneIdBefore = await page.evaluate(() => {
        const s = window.__crowGame?.scene?.getScene?.('GameScene');
        s.__stamp ??= Math.random().toString(36).slice(2);
        return s.__stamp;
    });

    await page.keyboard.press('Escape');
    await page.waitForTimeout(1200);
    const pauseEn = await readScreen();
    await writeFile(join(OUT, 'screen-en.json'), `${JSON.stringify(pauseEn, null, 2)}\n`);
    await page.locator('canvas').screenshot({ path: join(OUT, '01-pause-en.png') });

    if (flat(pauseEn).some(t => /^Theme:/.test(t))) ok('Pause offers the theme row');
    else fail('Pause has no theme row, so the two ports still disagree about what Pause offers');
    if (flat(pauseEn).includes('English')) ok('Pause offers the language row');
    else fail('Pause has no language row');

    // ── switch language from inside the level ────────────────────────────────
    await page.mouse.click(480, 322);
    await page.waitForTimeout(1200);
    const pauseIs = await readScreen();
    await writeFile(join(OUT, 'screen-is.json'), `${JSON.stringify(pauseIs, null, 2)}\n`);
    await page.locator('canvas').screenshot({ path: join(OUT, '02-pause-is.png') });

    const locale = await page.evaluate(() => localStorage.getItem('crow_locale'));
    if (locale === 'is') ok('the language row switched the locale to Icelandic');
    else fail(`clicking the language row left the locale at ${JSON.stringify(locale)}`);

    if (flat(pauseIs).includes('Íslenska')) ok('the Pause panel repainted its own rows');
    else fail('the Pause panel still shows the old language after switching');

    const afterTouch = await touchLabels();
    if (beforeTouch.length && afterTouch.length) {
        if (afterTouch.join(' ') !== beforeTouch.join(' ')) {
            ok(`touch controls re-rendered live: ${beforeTouch.join(' ')} -> ${afterTouch.join(' ')}`);
        } else {
            fail(`touch controls kept the old language (${beforeTouch.join(' ')}) — `
                + 'LOCALE_CHANGED is not reaching them');
        }
    } else if (beforeTouch.length && !afterTouch.length) {
        fail('the touch controls disappeared during the language switch');
    }

    const sceneIdAfter = await page.evaluate(() => window.__crowGame?.scene?.getScene?.('GameScene')?.__stamp);
    if (sceneIdAfter === sceneIdBefore) ok('GameScene was never restarted — the switch happened in place');
    else fail('GameScene restarted during the language switch, throwing the level away underneath the player');

    // ── and the theme path, triggered at runtime for the first time ──────────
    await page.mouse.click(480, 266);
    await page.waitForTimeout(1200);
    await page.locator('canvas').screenshot({ path: join(OUT, '03-theme-switched.png') });
    const themedScreen = await readScreen();
    const themeRow = flat(themedScreen).find(t => /^(Theme|Þema):/.test(t));
    if (themeRow) ok(`theme row now reads ${JSON.stringify(themeRow)}`);
    else fail('the theme row vanished after switching theme');

    if (errors.length === 0) ok('no console or page errors across both switches');
    else fail(`${errors.length} error(s): ${errors.slice(0, 3).join(' | ')}`);
} catch (err) {
    fail(`threw: ${err instanceof Error ? err.message : String(err)}`);
    await page.locator('canvas').screenshot({ path: join(OUT, '99-at-failure.png') }).catch(() => {});
} finally {
    await ctx.close();
}

console.log(`\nscreenshots and transcript in ${OUT}/`);
if (failures.length > 0) {
    console.log(`pause settings check: ${failures.length} problem(s)`);
    process.exit(1);
}
console.log('pause settings check: clean');
