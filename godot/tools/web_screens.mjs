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
 * KNOWN LIMITATION, so nobody re-discovers it as a bug in the game. The steps
 * that PLAY -- walking to the owl, the lesson, the maths board, and therefore
 * anything in the dashboard's log tab -- land reliably at the laptop viewport
 * and often stall at the spawn on the iPad one, with the game visibly still
 * running behind the stalled crow. It is the harness, not the build: driving
 * that viewport by hand through the same steps, without a screenshot after
 * every one, walks the crow to the owl and opens the lesson exactly as the
 * laptop run does. So read the iPad column for the login, the menu, the pause
 * card and how a level LOOKS, and the laptop column for everything past the
 * first owl.
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
/**
 * The walk, as steps that each end in a screenshot.
 *
 * TYPED, NOT CLICKED, through the login. Every earlier version of this file
 * clicked fields at fractions of the viewport height and it never once reached
 * the game: the column is centred, the two viewports are different heights, and
 * a click that misses a LineEdit by twenty pixels types the PIN into the name
 * box and then stalls on a form it cannot submit. Tab is not the way out either
 * -- in a web build the BROWSER owns Tab and moves DOM focus off the canvas
 * entirely.
 *
 * So the walk uses the keyboard path login.gd now provides for its own sake
 * (Login._advance_on_enter): every field's Enter moves to the next one, and the
 * last field's Enter submits. That is deterministic whatever the layout does,
 * which is what makes the screens past the login reachable at all.
 *
 * Past the login it is still blind clicks at the canvas centre, deliberately:
 * those screens are rows of buttons, coordinate-precise clicking is what makes
 * browser tests break on every layout change, and the point here is to reach
 * each screen rather than to assert a layout.
 */
// The dashboard's tab strip is pinned to the TOP of the screen rather than
// centred in it, so unlike everything else here it is at a fixed y whatever the
// viewport is: BAR_TOP + button_height + 8 + half of TAB_HEIGHT, from
// parent_report.gd. The three tabs are TAB_WIDTH + 10 apart.
const TAB_STRIP_Y = 14 + 64 + 8 + 27;
const TAB_STEP = 220;

function walk(page, view) {
    const mid = { x: view.width / 2, y: view.height / 2 };
    const click = (dx = 0, dy = 0) => page.mouse.click(mid.x + dx, mid.y + dy);
    const type = async (text) => { await page.keyboard.type(text, { delay: 60 }); };
    const enter = async () => { await page.keyboard.press('Enter'); await page.waitForTimeout(400); };
    return [
        // The canvas has to hold DOM focus before any key reaches Godot, and a
        // click is the only thing that gives it. This one lands between the
        // title and the button on purpose: it focuses and presses nothing.
        ['boot', async () => { await click(0, -80); }],
        // No profiles on a fresh browser, so the login screen's one primary
        // action is "New player", and it is the only button under the title.
        ['new-player', async () => click(0, 60)],
        // _show_new_player focuses the name field for us, so nothing here has
        // to know where that field is.
        ['name', async () => { await type('Hormann'); }],
        // Name -> birth year -> the PIN step. The year is optional and left
        // empty, which is the path most families will take.
        ['birth-year', enter],
        ['pin-step', enter],
        ['pin', async () => { await type('1234'); }],
        ['pin-again', async () => { await enter(); await type('1234'); }],
        ['signed-in', async () => { await enter(); await page.waitForTimeout(2500); }],
        ['main-menu', async () => page.waitForTimeout(800)],
        // Play is the primary row and now resumes straight into a level.
        ['playing', async () => { await click(0, -40); await page.waitForTimeout(3000); }],
        // WALK RIGHT UNTIL SOMETHING HAPPENS. The first owl of act one is a few
        // seconds along the ground, and reaching it is the only way to
        // photograph the maths board -- and the only way the grown-up
        // dashboard's log tab has anything in it at all.
        ['walked', async () => {
            // PULSED, not held down once.
            //
            // A single long `down('ArrowRight')` walked the crow on one viewport
            // and left it standing at the spawn on the other, in the same build,
            // with the game visibly running behind it. The reason is in
            // crow-focus.js's own header: Godot's blur handler RELEASES every
            // held key, so any focus blip during the hold ends the walk -- and
            // keydown has already fired, so nothing ever presses it again.
            // Pressing repeatedly survives that, and is closer to what a child
            // holding an arrow key actually produces anyway.
            for (let i = 0; i < 34; i += 1) {
                await page.keyboard.press('ArrowRight');
                await page.waitForTimeout(90);
            }
            await page.waitForTimeout(1200);
        }],
        // The first owl of a subject teaches before it asks, so what comes up
        // is a lesson card and not the board. Enter takes its Next/Skip.
        ['lesson-done', async () => {
            for (let i = 0; i < 6; i += 1) { await page.keyboard.press('Enter'); await page.waitForTimeout(700); }
        }],
        // THE KEYBOARD PATH THE OWNER ASKED FOR ON PC: left and right move a
        // mark along the row of answers, Enter commits the one it is on. Both
        // this card and the board behind it work the same way, which they did
        // not until the tour photographed this card twice in a row unchanged.
        ['answer-chosen', async () => {
            await page.keyboard.press('ArrowRight');
            await page.waitForTimeout(600);
        }],
        // Guess along the row until one lands. A wrong pick on a lesson card
        // costs nothing and disables that option, and the mark skips disabled
        // ones -- so walking right and confirming gets there in at most as many
        // presses as there are options.
        ['lesson-answered', async () => {
            for (let i = 0; i < 4; i += 1) {
                await page.keyboard.press('Enter');
                await page.waitForTimeout(900);
                await page.keyboard.press('ArrowRight');
                await page.waitForTimeout(300);
            }
            await page.waitForTimeout(2500);
        }],
        // And now the board itself, which is the surface that RECORDS an
        // answer -- the lesson deliberately never touches the learner model, so
        // nothing before this puts a row in the dashboard's log.
        ['board', async () => { await page.waitForTimeout(1200); }],
        ['board-answered', async () => {
            for (let i = 0; i < 4; i += 1) {
                await page.keyboard.press('ArrowRight');
                await page.waitForTimeout(300);
                await page.keyboard.press('Enter');
                await page.waitForTimeout(1400);
            }
            await page.waitForTimeout(2500);
        }],
        // THE SCREEN THIS TOOL WAS WRITTEN FOR. `pause` is bound to Escape.
        ['paused', async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(600); }],
        // Out of the level, back to the menu, and into the grown-up dashboard,
        // which is the screen with the most on it and the least tested layout.
        // Quit is the last row of the pause card.
        // KEYBOARD AGAIN. A fixed offset for Quit put the click on the language
        // row at 1180x820 and switched the whole game to Icelandic mid-tour --
        // the pause card is centred, so its rows sit at different absolute
        // heights on every viewport. Focus starts on Resume; four Downs reach
        // Quit and saturate there.
        ['quit-to-menu', async () => {
            for (let i = 0; i < 4; i += 1) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(150); }
            await page.keyboard.press('Enter');
            await page.waitForTimeout(2500);
        }],
        // The session recap lands over the menu on arrival from play. Dismiss it
        // so the shots after this are of the menu and the dashboard.
        ['recap', async () => { await page.waitForTimeout(600); }],
        ['menu-after-play', async () => { await page.keyboard.press('Enter'); await page.waitForTimeout(1200); }],
        // KEYBOARD, not a click, for the same reason the login form is typed:
        // the menu's rows move as a child unlocks things (a returning player
        // gets PLAY, a world picker and a progress row that a new one does not),
        // so no fixed offset finds the last row twice running. Down walks the
        // focus ring to the bottom whatever is on the screen.
        ['dashboard', async () => {
            // FOUR, not more. The returning-player menu is five rows and the
            // focus starts on the first, so four Downs lands on the last one and
            // saturates there on the shorter menu a new player sees. A fifth
            // escapes the column into the language chips in the corner, and the
            // Enter after it switched the whole game to Icelandic -- which the
            // iPad run of this tour did, and photographed.
            for (let i = 0; i < 4; i += 1) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(150); }
            await page.keyboard.press('Enter');
            await page.waitForTimeout(2500);
        }],
        // The tab strip sits under the name; the three tabs are side by side.
        ['dashboard-log', async () => { await page.mouse.click(mid.x, TAB_STRIP_Y); await page.waitForTimeout(1200); }],
        ['dashboard-settings', async () => { await page.mouse.click(mid.x + TAB_STEP, TAB_STRIP_Y); await page.waitForTimeout(1200); }],
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
