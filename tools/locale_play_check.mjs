#!/usr/bin/env node
/**
 * Play the web build in each locale and read back what a child actually sees.
 *
 * This exists because localisation was, until now, untestable end to end. The
 * math board draws to a WebGL canvas, so nothing outside the game can read the
 * text off it: a smoke run against a fully Icelandic build and a fully English
 * one produced byte-identical results. Every check that existed compared
 * `prompt.text`, which is canonical English by design and stays English in every
 * locale -- so it would have reported success on a build that showed a child
 * nothing but English.
 *
 * So the game now exposes the rendered question through its debug hook
 * (src/main.ts -> MathBoard.getRenderedQuestion), and this drives a real level in
 * both locales and asserts on it:
 *
 *   - the rendered question differs from the canonical English in Icelandic, and
 *     equals it in English;
 *   - no placeholder survives substitution, in either locale;
 *   - Icelandic text really is Icelandic -- it carries the language's own
 *     letters, or is a wordless arithmetic prompt where both locales agree;
 *   - the answer options still match the problem, so localisation did not
 *     disturb the maths.
 *
 * Usage:
 *   npx vite --config vite/config.dev.mjs &
 *   CHROME_PATH=/opt/pw-browsers/chromium node tools/locale_play_check.mjs
 *
 * Env: CROW_DEV_URL (default http://localhost:8080/), CHROME_PATH.
 */
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

const URL = process.env.CROW_DEV_URL ?? 'http://localhost:8080/';
const EXECUTABLE = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium';
const OUT = 'output/playwright/locale-play';
/**
 * Owl encounters are short, so sampling one problem proves the wiring but little
 * else -- if every sampled prompt happened to be wordless ("7 + 3 = ?"), which
 * 669 of the 3000 are, the Icelandic assertions would all pass without a single
 * translated string having been rendered. So restart the level repeatedly to
 * sample a spread, and report how many samples actually had words in them.
 */
const ROUNDS = 6;

/** Letters Icelandic has and English does not. */
const ICELANDIC_LETTERS = /[áéíóúýðþæöÁÉÍÓÚÝÐÞÆÖ]/;
/** A prompt with no letters at all ("7 + 3 = ?") reads the same in both. */
const hasWords = s => /[A-Za-z]{2,}/.test(s ?? '');

const failures = [];
const fail = m => { failures.push(m); console.log(`  FAIL  ${m}`); };
const ok = m => console.log(`  ok    ${m}`);

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});

const observed = { en: [], is: [] };

async function playLocale(locale) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    // Set the locale before the game boots, under the key both runtimes use.
    await page.addInitScript(code => {
        try {
            for (const key of Object.keys(localStorage)) {
                if (key.startsWith('crow_')) localStorage.removeItem(key);
            }
            localStorage.setItem('crow_locale', code);
        } catch { /* private mode */ }
    }, locale);

    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => Boolean(window.__crowMathSmoke), undefined, { timeout: 20_000 });

    // Boot has to finish before startLevel, or it tears down scenes that are
    // still coming up and the level never populates.
    await page.waitForFunction(() => {
        const s = window.__crowGame?.scene;
        return Boolean(s?.isActive?.('LoginScene') || s?.isActive?.('MainMenuScene')
            || s?.isActive?.('LevelSelectScene'));
    }, undefined, { timeout: 20_000 });

    const active = await page.evaluate(() => window.__crowMathSmoke?.getLocale?.() ?? null);
    const seen = [];

    for (let round = 0; round < ROUNDS; round++) {
        await page.evaluate(() => window.__crowMathSmoke?.clearCompletions?.());
        await page.evaluate(() => window.__crowMathSmoke?.startLevel('level_01'));
        await page.waitForFunction(
            () => Boolean(window.__crowGame?.scene?.isActive?.('GameScene')),
            undefined, { timeout: 20_000 },
        );
        // Owls spawn a beat after GameScene activates; triggering before they
        // exist returns false and the wait for an overlay then times out with
        // nothing to say about why.
        await page.waitForFunction(
            () => Boolean(window.__crowGame?.scene?.getScene?.('GameScene')?.activeNPCs?.length),
            undefined, { timeout: 20_000 },
        );
        const triggered = await page.evaluate(
            () => window.__crowMathSmoke?.triggerFirstOwlInteraction?.() ?? false,
        );
        if (!triggered) throw new Error(`round ${round}: could not trigger an owl interaction`);
        await page.waitForFunction(
            () => Boolean(window.__crowMathSmoke?.getMathState?.()),
            undefined, { timeout: 15_000 },
        );
        await page.waitForTimeout(600);

        // Walk the encounter's problems, answering correctly to advance.
        for (let step = 0; step < 4; step++) {
            const state = await page.evaluate(() => window.__crowMathSmoke?.getMathState?.() ?? null);
            if (!state) break;
            seen.push(state);
            if (round === 0 && step === 0) {
                await page.screenshot({ path: join(OUT, `${locale}-board.png`) });
            }
            const target = state.optionCenters.find(o => o.value === state.correctAnswer);
            if (!target) break;
            // The board locks input for a few seconds after a wrong answer, so
            // retry until the click actually registers.
            for (let attempt = 0; attempt < 10; attempt++) {
                await page.mouse.click(
                    state.canvasRect.left + target.x * (state.canvasRect.width / 960),
                    state.canvasRect.top + target.y * (state.canvasRect.height / 540),
                );
                await page.waitForTimeout(450);
                const next = await page.evaluate(() => window.__crowMathSmoke?.getMathState?.() ?? null);
                if (!next || next.problemId !== state.problemId) break;
            }
        }
    }

    await page.close();
    return { active, seen, errors };
}

try {
    for (const locale of ['en', 'is']) {
        console.log(`\n── ${locale} ──`);
        const { active, seen, errors } = await playLocale(locale);
        observed[locale] = seen;

        if (active === locale) ok(`the game reports locale=${locale}`);
        else fail(`asked for locale=${locale} but the game reports ${JSON.stringify(active)}`);

        const withWords = seen.filter(s => hasWords(s.prompt)).length;
        if (seen.length > 0) ok(`reached ${seen.length} problem(s), ${withWords} with words to translate`);
        else fail('never reached a math problem, so nothing was checked');
        if (locale === 'is' && seen.length > 0 && withWords === 0) {
            fail('every sampled Icelandic prompt was wordless, so nothing about '
                + 'translation was actually exercised');
        }

        for (const s of seen) {
            const rendered = s.renderedPrompt;
            if (typeof rendered !== 'string' || rendered.length === 0) {
                fail(`${s.problemId}: the board reported no rendered question`);
                continue;
            }
            if (/\{[a-z]/.test(rendered)) {
                fail(`${s.problemId}: an unsubstituted placeholder is on the board: ${JSON.stringify(rendered)}`);
            }
            if (locale === 'en' && rendered !== s.prompt) {
                fail(`${s.problemId}: English render differs from the canonical text: `
                    + `${JSON.stringify(rendered)} vs ${JSON.stringify(s.prompt)}`);
            }
            if (locale === 'is' && hasWords(s.prompt)) {
                if (rendered === s.prompt) {
                    fail(`${s.problemId}: still English in Icelandic: ${JSON.stringify(rendered)}`);
                } else if (!ICELANDIC_LETTERS.test(rendered) && /[A-Za-z]/.test(rendered)) {
                    // Not every Icelandic sentence needs a special letter, so this
                    // is reported rather than failed -- but it is worth seeing.
                    console.log(`  note  ${s.problemId}: translated but carries no Icelandic-specific `
                        + `letter: ${JSON.stringify(rendered)}`);
                }
            }
            if (!s.options.includes(s.correctAnswer)) {
                fail(`${s.problemId}: the correct answer is not among the options`);
            }
        }
        if (errors.length === 0) ok('no page errors');
        else fail(`page error(s): ${errors.slice(0, 2).join(' | ')}`);
    }

    console.log('\n── what a child reads ──');
    for (const locale of ['en', 'is']) {
        for (const s of observed[locale]) {
            console.log(`  ${locale.toUpperCase()}  ${JSON.stringify(s.renderedPrompt)}`);
        }
    }
} catch (err) {
    fail(`threw: ${err instanceof Error ? err.message : String(err)}`);
} finally {
    await browser.close();
}

await writeFile(join(OUT, 'observed.json'), `${JSON.stringify(observed, null, 2)}\n`, 'utf8');
console.log(`\nscreenshots and transcript in ${OUT}/`);
if (failures.length > 0) {
    console.log(`locale play check: ${failures.length} problem(s)`);
    process.exit(1);
}
console.log('locale play check: clean');
