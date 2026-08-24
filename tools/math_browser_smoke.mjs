import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright-core';
import { computeMathBrowserSmokeFingerprint } from './math_artifact_fingerprint.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const REPORTS_DIR = join(ROOT, 'reports', 'math-batches');
const OUTPUT_DIR = join(ROOT, 'output', 'playwright', 'math-browser-smoke');
const REPORT_PATH = join(REPORTS_DIR, 'runtime-browser-smoke.json');
const BASE_URL = process.env.CROW_DEV_URL ?? 'http://localhost:8080/';
const VIEWPORT = { width: 1920, height: 1080 };
const EXECUTABLE_CANDIDATES = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);
let lastStage = 'boot';

function resolveExecutablePath() {
    const executablePath = EXECUTABLE_CANDIDATES.find(candidate => existsSync(candidate));
    if (!executablePath) {
        throw new Error('Could not find a local Chrome or Edge executable for browser smoke.');
    }
    return executablePath;
}

async function ensureDirs() {
    await mkdir(REPORTS_DIR, { recursive: true });
    await mkdir(OUTPUT_DIR, { recursive: true });
}

async function getMathState(page) {
    return page.evaluate(() => window.__crowMathSmoke?.getMathState?.() ?? null);
}

async function getCompletions(page) {
    return page.evaluate(() => window.__crowMathSmoke?.getCompletionHistory?.() ?? []);
}

async function getRenderMetrics(page) {
    return page.evaluate(() => {
        const game = window.__crowGame;
        const size = game?.scale?.gameSize ?? { width: 960, height: 540 };
        return {
            gameWidth: size.width ?? 960,
            gameHeight: size.height ?? 540,
        };
    });
}

async function clickOption(page, optionValue) {
    const [state, metrics] = await Promise.all([
        getMathState(page),
        getRenderMetrics(page),
    ]);

    if (!state?.canvasRect) {
        throw new Error('Math state is missing canvasRect');
    }

    const option = state.optionCenters.find(entry => entry.value === optionValue);
    if (!option) {
        throw new Error(`Could not find option ${optionValue}`);
    }

    const clickX = state.canvasRect.left + ((option.x / metrics.gameWidth) * state.canvasRect.width);
    const clickY = state.canvasRect.top + ((option.y / metrics.gameHeight) * state.canvasRect.height);
    await page.mouse.click(clickX, clickY);
}

async function saveScreenshot(page, name) {
    await page.screenshot({
        path: join(OUTPUT_DIR, `${name}.png`),
    });
}

async function runSmoke() {
    const consoleErrors = [];
    const pageErrors = [];
    let stage = 'launch_browser';
    lastStage = stage;
    const executablePath = resolveExecutablePath();
    const browser = await chromium.launch({
        executablePath,
        headless: true,
    });
    const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    page.on('console', message => {
        if (message.type() === 'error') {
            consoleErrors.push(message.text());
        }
    });
    page.on('pageerror', error => {
        pageErrors.push(error.message);
    });

    try {
        stage = 'goto_app';
        lastStage = stage;
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        stage = 'wait_for_math_hook_initial';
        lastStage = stage;
        await page.waitForFunction(() => Boolean(window.__crowMathSmoke), undefined, { timeout: 15_000 });

        stage = 'clear_crow_state';
        lastStage = stage;
        const clearedKeys = await page.evaluate(() => {
            const keys = Object.keys(localStorage).filter(key => key.startsWith('crow_'));
            for (const key of keys) {
                localStorage.removeItem(key);
            }
            return keys;
        });

        stage = 'reload_after_clear';
        lastStage = stage;
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
        stage = 'wait_for_math_hook_reload';
        lastStage = stage;
        await page.waitForFunction(() => Boolean(window.__crowMathSmoke), undefined, { timeout: 15_000 });
        stage = 'wait_for_post_boot_scene';
        lastStage = stage;
        await page.waitForFunction(
            () => {
                const scenePlugin = window.__crowGame?.scene;
                return Boolean(
                    scenePlugin?.isActive?.('LoginScene') ||
                    scenePlugin?.isActive?.('MainMenuScene') ||
                    scenePlugin?.isActive?.('LevelSelectScene'),
                );
            },
            undefined,
            { timeout: 15_000 },
        );
        stage = 'clear_completion_history';
        lastStage = stage;
        await page.evaluate(() => window.__crowMathSmoke?.clearCompletions?.());

        stage = 'start_level';
        lastStage = stage;
        await page.evaluate(() => window.__crowMathSmoke?.startLevel('level_01'));
        stage = 'wait_for_game_scene';
        lastStage = stage;
        await page.waitForFunction(
            () => Boolean(window.__crowGame?.scene?.isActive?.('GameScene')),
            undefined,
            { timeout: 10_000 },
        );
        stage = 'wait_for_active_npcs';
        lastStage = stage;
        await page.waitForFunction(
            () => {
                const scene = window.__crowGame?.scene?.getScene?.('GameScene');
                return Boolean(scene?.activeNPCs?.length);
            },
            undefined,
            { timeout: 10_000 },
        );

        stage = 'trigger_first_owl';
        lastStage = stage;
        const triggered = await page.evaluate(() => window.__crowMathSmoke?.triggerFirstOwlInteraction?.() ?? false);
        if (!triggered) {
            throw new Error('Could not trigger the first owl interaction');
        }

        stage = 'wait_for_math_overlay';
        lastStage = stage;
        await page.waitForFunction(() => Boolean(window.__crowMathSmoke?.getMathState?.()), undefined, { timeout: 10_000 });
        await page.waitForTimeout(600);

        // A fresh profile meets its first-ever domain here, so the owl opens
        // with a worked-example demo (no input accepted) and then hands over
        // a freebie problem. Wait the demo out; the smoke exercises the real
        // problem that follows.
        stage = 'wait_out_teaching_demo';
        lastStage = stage;
        const openingState = await getMathState(page);
        let demoSeen = false;
        if (openingState?.demo) {
            demoSeen = true;
            await saveScreenshot(page, 'math-demo');
            await page.waitForFunction(
                () => {
                    const state = window.__crowMathSmoke?.getMathState?.();
                    return Boolean(state) && state.demo !== true;
                },
                undefined,
                { timeout: 15_000 },
            );
            await page.waitForTimeout(600);
        }

        const firstState = await getMathState(page);
        if (!firstState) {
            throw new Error('Missing first math state');
        }
        if (firstState.demo) {
            throw new Error('Demo overlay never handed over to a real problem');
        }
        stage = 'screenshot_first_problem';
        lastStage = stage;
        await saveScreenshot(page, 'math-first');

        const wrongOption = firstState.options.find(option => option !== firstState.correctAnswer);
        if (wrongOption === undefined) {
            throw new Error('Could not find a wrong option for the first problem');
        }

        stage = 'click_wrong_answer';
        lastStage = stage;
        await clickOption(page, wrongOption);
        stage = 'wait_for_wrong_attempt';
        lastStage = stage;
        await page.waitForFunction(
            () => (window.__crowMathSmoke?.getMathState?.()?.wrongAttempts ?? 0) >= 1,
            undefined,
            { timeout: 5_000 },
        );
        const afterWrongState = await getMathState(page);
        stage = 'screenshot_after_wrong';
        lastStage = stage;
        await saveScreenshot(page, 'math-after-wrong');

        stage = 'click_first_correct_answer';
        lastStage = stage;
        // The board locks input for a few seconds after a wrong answer while the
        // "let's try again" feedback plays, and that window is long enough --
        // and variable enough by problem type -- that a single click 700ms later
        // was simply swallowed. Because problem selection is non-deterministic,
        // that made this smoke pass or fail by draw. Retry the correct answer
        // until the completion actually registers.
        {
            const RETRY_INTERVAL_MS = 750;
            const RETRY_TIMEOUT_MS = 15_000;
            const deadline = Date.now() + RETRY_TIMEOUT_MS;
            let registered = false;
            while (Date.now() < deadline) {
                await clickOption(page, firstState.correctAnswer);
                await page.waitForTimeout(RETRY_INTERVAL_MS);
                const completions = await getCompletions(page);
                if (completions.length >= 1) {
                    registered = true;
                    break;
                }
            }
            if (!registered) {
                throw new Error('First correct answer never registered a completion');
            }
        }

        // Baseline owl asks exactly one problem: after the correct answer the
        // overlay closes and the encounter is over. A future gated NPC can
        // raise problemCount, at which point this smoke needs a follow-up leg.
        stage = 'wait_for_overlay_close_after_first';
        lastStage = stage;
        await page.waitForFunction(
            () => {
                const smoke = window.__crowMathSmoke;
                const completions = smoke?.getCompletionHistory?.() ?? [];
                const state = smoke?.getMathState?.();
                return completions.length >= 1 && !state;
            },
            undefined,
            { timeout: 8_000 },
        );

        stage = 'screenshot_after_encounter';
        lastStage = stage;
        await saveScreenshot(page, 'math-second');

        const completions = await getCompletions(page);
        const finalState = await getMathState(page);
        stage = 'report_success';
        lastStage = stage;

        const gateChecks = {
            // A fresh profile's first-ever domain must open with the worked-
            // example demo before any test.
            teachingDemoSeen: demoSeen,
            wrongAttemptRegistered: (afterWrongState?.wrongAttempts ?? 0) >= 1,
            singleProblemEncounter: completions.length === 1,
            completionCountReached: completions.length >= 1,
            finalOverlayClosed: finalState === null,
            consoleClean: consoleErrors.length === 0,
            pageClean: pageErrors.length === 0,
        };
        const accepted = Object.values(gateChecks).every(Boolean);

        return {
            accepted,
            kind: 'browser_math_scene_smoke',
            reviewedAt: new Date().toISOString(),
            baseUrl: BASE_URL,
            viewport: VIEWPORT,
            whatThisIs: 'Literal browser-backed smoke for the live owl interaction, MathChallengeScene input, wrong-answer retry, and the single-problem completion flow.',
            whatThisIsNot: 'Not telemetry-backed pedagogy proof, not an empirical ELO calibration study, and not broad cross-session child replayability evidence.',
            clearedKeyCount: clearedKeys.length,
            firstPrompt: firstState.prompt,
            firstProblemId: firstState.problemId,
            firstCorrectAnswer: firstState.correctAnswer,
            wrongOptionClicked: wrongOption,
            wrongAttemptRegistered: gateChecks.wrongAttemptRegistered,
            singleProblemEncounter: gateChecks.singleProblemEncounter,
            completionCount: completions.length,
            completionHistory: completions,
            finalOverlayClosed: gateChecks.finalOverlayClosed,
            gateChecks,
            consoleErrors,
            pageErrors,
            screenshots: [
                'output/playwright/math-browser-smoke/math-demo.png',
                'output/playwright/math-browser-smoke/math-first.png',
                'output/playwright/math-browser-smoke/math-after-wrong.png',
                'output/playwright/math-browser-smoke/math-second.png',
            ],
            stage,
        };
    } finally {
        await context.close();
        await browser.close();
    }
}

await ensureDirs();

let report;
const sourceFingerprint = await computeMathBrowserSmokeFingerprint(ROOT);
try {
    report = await runSmoke();
} catch (error) {
    report = {
        accepted: false,
        kind: 'browser_math_scene_smoke',
        reviewedAt: new Date().toISOString(),
        baseUrl: BASE_URL,
        viewport: VIEWPORT,
        whatThisIs: 'Literal browser-backed smoke for the live owl interaction and MathChallengeScene flow.',
        whatThisIsNot: 'Not telemetry-backed pedagogy proof and not an empirical ELO calibration study.',
        sourceFingerprint,
        error: error instanceof Error ? error.message : String(error),
        stage: lastStage,
    };
    process.exitCode = 1;
}

if (!('sourceFingerprint' in report)) {
    report.sourceFingerprint = sourceFingerprint;
}

await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`[math:browser-smoke] wrote ${REPORT_PATH}`);
if (!report.accepted) {
    process.exitCode = 1;
}
