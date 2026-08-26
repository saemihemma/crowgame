/**
 * What happens when a child clicks out of the browser mid-question.
 *
 * THE REPORT. "when i click out of it, (the browser), it leaves the math problem
 * or does something wierd." Two readings -- the board goes away, or the board
 * stays and stops working -- and a screenshot cannot tell them apart, so this
 * measures both: whether the board is still drawn, and whether it can still be
 * answered.
 *
 * WHAT A REAL BLUR IS. `window.blur()` from inside the page does not move browser
 * focus and Godot never sees it. Opening a second tab and bringing it to front
 * does: the engine's own blur and visibilitychange handlers fire, exactly as they
 * would when a child taps another app. Focus moving to another ELEMENT in the page
 * is a third case and a different one -- that is what clicking the URL bar, or
 * Godot's own virtual-keyboard <input> closing, leaves behind -- so it is tested
 * separately.
 *
 * WHAT IT MEASURES, AND WHY NOT JUST PIXELS. Godot 4.3's web export binds keydown
 * and keyup to the CANVAS element. So "can the child still play" is, precisely,
 * "does the canvas still receive keydown" -- a DOM fact, readable without knowing
 * anything about game state. This harness counts canvas keydowns alongside the
 * screenshots, because the pixels say whether the question is still there and the
 * counter says whether answering it is possible.
 *
 * Run: node godot/tools/focus_loss_repro.mjs [--port 8072] [--shots <dir>]
 */
import { existsSync, readdirSync } from 'fs';
import { spawn } from 'child_process';
import { mkdir } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const WEB_DIR = resolve(ROOT, 'output/web');
const argv = process.argv;
const PORT = Number(argv.includes('--port') ? argv[argv.indexOf('--port') + 1] : 8072);
const SHOT_DIR = argv.includes('--shots')
    ? resolve(argv[argv.indexOf('--shots') + 1])
    : resolve(ROOT, 'output/focus-repro');

const IPAD = { width: 1180, height: 820 };
const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH].find(p => p && existsSync(p));

// Positions login.gd lays its fields out at on this viewport. Coordinate-blind
// clicking cannot create a profile: the name and PIN are separate LineEdits and
// neither holds focus until it is clicked.
const NEW_PLAYER = { x: 590, y: 486 };
const NAME_FIELD = { x: 590, y: 200 };
const PIN_FIELD = { x: 590, y: 330 };
const CREATE = { x: 590, y: 608 };

// Every lesson in tutorials.json, marked seen before the run so the first modal
// an owl raises is the MATHS BOARD and not a lesson card. An earlier version of
// this script did not do that, reported "board reached", and had photographed
// card one of "Putting together" -- a modal, but not the one under test.
const TUTORIAL_IDS = [
    "addition.count_all",
    "addition.count_on",
    "addition.make_ten",
    "addition.teen_numbers",
    "addition.bridge_ten",
    "addition.tens_and_ones",
    "addition.carrying",
    "addition.missing_part",
    "addition.balance",
    "subtraction.take_away",
    "subtraction.count_back",
    "subtraction.bridge_back",
    "subtraction.teens_back",
    "subtraction.tens_and_ones",
    "subtraction.borrowing",
    "counting.to_five",
    "counting.to_ten",
    "counting.ten_and_more",
    "comparison.more_or_less",
    "comparison.compare_teens",
    "pattern_matching.ab_repeat",
    "pattern_matching.longer_core",
    "pattern_matching.tricky_core",
    "number_sequence.one_more",
    "number_sequence.skip_two",
    "number_sequence.bigger_jumps",
    "multiplication.equal_groups",
    "multiplication.skip_counting",
    "multiplication.threes_and_fours",
    "multiplication.zero_and_squares",
    "multiplication.harder_tables",
    "multiplication.two_digit",
    "division.sharing",
    "division.tens_and_fives",
    "division.threes_and_fours",
    "division.zero_and_squares",
    "division.harder_tables",
    "division.two_digit",
    "comparison.compare_larger",
    "number_sequence.big_skips",
    "subtraction.missing_part",
    "subtraction.start_unknown",
    "subtraction.balance",
    "addition.both_sides",
    "multiplication.missing_factor",
    "division.missing_groups",
    "division.start_unknown"
];

function serve() {
    return spawn(process.execPath, ['-e', `
        const http=require('http'),fs=require('fs'),path=require('path');
        const MIME={'.html':'text/html','.js':'text/javascript','.wasm':'application/wasm',
            '.pck':'application/octet-stream','.png':'image/png','.json':'application/json',
            '.svg':'image/svg+xml','.wav':'audio/wav','.mp3':'audio/mpeg'};
        http.createServer((req,res)=>{
            if(req.url.startsWith('/api/')){res.writeHead(200,{'content-type':'application/json'});
                return res.end(req.url.includes('auth/session')?'{"enrolled":false}':'{}');}
            const p=path.join(${JSON.stringify(WEB_DIR)},req.url==='/'?'index.html':decodeURIComponent(req.url.split('?')[0]));
            fs.readFile(p,(e,b)=>{ if(e){res.writeHead(404).end('nope');return;}
                res.writeHead(200,{'content-type':MIME[path.extname(p)]||'application/octet-stream'});res.end(b);});
        }).listen(${PORT},'127.0.0.1');
    `], { stdio: 'ignore' });
}

const wait = (page, ms) => page.waitForTimeout(ms);

async function boot(page) {
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 180_000 });
    await page.waitForFunction(() => {
        const c = document.querySelector('canvas');
        return c && c.width > 0 && c.height > 0;
    }, { timeout: 240_000 });
    await wait(page, 9000);
}

async function createProfile(page) {
    await page.mouse.click(NEW_PLAYER.x, NEW_PLAYER.y);
    await wait(page, 1500);
    await page.mouse.click(NAME_FIELD.x, NAME_FIELD.y);
    await wait(page, 300);
    await page.keyboard.type('Focus', { delay: 60 });
    await page.mouse.click(PIN_FIELD.x, PIN_FIELD.y);
    await wait(page, 300);
    await page.keyboard.type('1234', { delay: 60 });
    await wait(page, 400);
    await page.mouse.click(CREATE.x, CREATE.y);
    await wait(page, 3000);
}

/**
 * Count every keydown the CANVAS receives, and report where focus is.
 *
 * This is the whole mechanism in two numbers. Godot listens for keys on the
 * canvas element, so a canvas that is not the active element hears nothing --
 * and a listener of our own on the same element hears exactly what the engine's
 * would. Re-installed after every reload, since a reload wipes it.
 */
async function instrument(page) {
    await page.evaluate(() => {
        const c = document.getElementById('canvas') || document.querySelector('canvas');
        window.__keys = { canvas: 0, window: 0 };
        c.addEventListener('keydown', () => { window.__keys.canvas += 1; });
        window.addEventListener('keydown', () => { window.__keys.window += 1; });
    });
}

async function focusState(page) {
    return page.evaluate(() => {
        const c = document.getElementById('canvas') || document.querySelector('canvas');
        const a = document.activeElement;
        return {
            active: a ? (a.id ? `${a.tagName}#${a.id}` : a.tagName) : 'none',
            canvasHasFocus: a === c,
            keys: { ...(window.__keys || { canvas: -1, window: -1 }) },
        };
    });
}

/** Press a key and report whether the canvas -- and so the engine -- heard it. */
async function keyReaches(page, key) {
    const before = (await focusState(page)).keys.canvas;
    await page.keyboard.press(key);
    await wait(page, 250);
    return (await focusState(page)).keys.canvas > before;
}

/**
 * Reach into the export's own save store and set two things before the run.
 *
 * WHY THE ARENA. Reproducing a blur needs a maths board open, and getting one in
 * level_01 means walking a crow past real pits with blind keystrokes -- the first
 * attempt died repeatedly and never reached an owl in thirty tries, which is its
 * own finding about checkpoints but useless here. level_99 is a flat 200-tile run
 * with an owl every ten tiles and no pits at all, so a board is a few tiles of
 * walking away and nothing can fall.
 *
 * WHY THE LESSONS ARE MARKED SEEN. An owl raises a lesson before its question
 * when the concept is new, and on a fresh profile every concept is new.
 *
 * WHY NOT REBUILD. Config.flag reads a per-device override out of Persistence
 * before the authored default, and on the Web export Persistence is one JSON file
 * inside an Emscripten IDBFS mount persisted into an IndexedDB database named
 * "/userfs". So both can be written from the page -- which beats editing the repo
 * and re-exporting, because then the thing under test would not be the shipped
 * build.
 *
 * Nothing here is hardcoded that can be discovered. user:// is
 * <mount>/godot/app_userdata/<project name>/ and the project name carries a
 * non-ASCII character not worth asserting from a harness; the save key is
 * `crow_save_<username>`, and a freshly created profile has no save at all yet
 * because SaveManager only writes on a game event -- so one is authored. load_save
 * merges a parsed save over the defaults, so a save carrying only a version and
 * tutorialsSeen is a legal save.
 */
async function seedStore(page, { flags = {}, tutorialsSeen = [] }) {
    return page.evaluate(async ({ flags, tutorialsSeen }) => {
        const open = name => new Promise((res, rej) => {
            const r = indexedDB.open(name);
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
        });
        let db;
        try { db = await open('/userfs'); } catch (e) { return { ok: false, reason: String(e) }; }
        const stores = [...db.objectStoreNames];
        if (!stores.length) return { ok: false, reason: '/userfs has no object stores' };
        const store = stores.includes('FILE_DATA') ? 'FILE_DATA' : stores[0];
        const reader = () => db.transaction([store], 'readonly').objectStore(store);
        const allKeys = await new Promise((res, rej) => {
            const r = reader().getAllKeys();
            r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
        });
        const FILE = [...allKeys].find(k => String(k).endsWith('/crow_localstorage.json'));
        if (!FILE) return { ok: false, reason: 'no crow_localstorage.json yet' };
        const entry = await new Promise((res, rej) => {
            const r = reader().get(FILE);
            r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
        });
        if (!entry || !entry.contents) return { ok: false, reason: 'file has no contents' };
        const kv = JSON.parse(new TextDecoder().decode(entry.contents));

        // Config.set_flag_override JSON-encodes, so a bool stays a bool.
        for (const [path, value] of Object.entries(flags)) {
            kv[`crow_flag_${path}`] = JSON.stringify(value);
        }

        let saveKey = null;
        let authored = false;
        if (tutorialsSeen.length) {
            for (const [k, v] of Object.entries(kv)) {
                if (typeof v !== 'string') continue;
                let parsed;
                try { parsed = JSON.parse(v); } catch (e) { continue; }
                if (!parsed || typeof parsed !== 'object') continue;
                if (!('tutorialsSeen' in parsed) || !('mathStats' in parsed)) continue;
                for (const id of tutorialsSeen) parsed.tutorialsSeen[id] = { skipped: false, at: 1 };
                kv[k] = JSON.stringify(parsed);
                saveKey = k;
                break;
            }
            if (!saveKey) {
                let active = kv['crow_active_user'];
                try { const inner = JSON.parse(active); if (typeof inner === 'string') active = inner; }
                catch (e) { /* stored raw */ }
                if (typeof active !== 'string' || !active) {
                    return { ok: false, reason: `no active user; keys = ${Object.keys(kv).join(', ')}` };
                }
                const seen = {};
                for (const id of tutorialsSeen) seen[id] = { skipped: false, at: 1 };
                saveKey = `crow_save_${active}`;
                kv[saveKey] = JSON.stringify({ version: 1, tutorialsSeen: seen });
                authored = true;
            }
        }

        const patched = { ...entry, contents: new TextEncoder().encode(JSON.stringify(kv)), timestamp: new Date() };
        await new Promise((res, rej) => {
            const r = db.transaction([store], 'readwrite').objectStore(store).put(patched, FILE);
            r.onsuccess = () => res(); r.onerror = () => rej(r.error);
        });
        return { ok: true, saveKey, authored, lessons: tutorialsSeen.length };
    }, { flags, tutorialsSeen });
}

async function enterArena(page) {
    await page.keyboard.press('Enter');       // main menu: PLAY holds focus
    await wait(page, 1800);
    // Locked cards take FOCUS_NONE (world_card.gd), so ui_right walks only the
    // reachable ones: level_01, then the arena. Focus order does not depend on
    // the ScrollContainer's snap position, which a click would.
    await page.keyboard.press('ArrowRight');
    await wait(page, 700);
    await page.keyboard.press('Enter');
    await wait(page, 4000);
}

/**
 * Is a board covering the middle of the screen?
 *
 * FLATNESS, NOT BRIGHTNESS. The first version of this thresholded the mean
 * brightness of the centre band, on the theory that a board is a dark panel. Over
 * the practice arena's bright sky a real maths board moved the mean by thirteen
 * points -- less than the frame-to-frame drift of walking -- and the harness
 * reported "no board" while the screenshot it had just taken showed one.
 *
 * What a panel actually is, whatever colour the theme paints it, is a large area
 * of ONE colour. Level scenery is textured and graded and never is. So: quantise
 * the centre band, find its most common colour, and measure what fraction of the
 * band sits within a small distance of it. Measured on the two states this
 * harness produces: 0.39 with the level showing, 0.75 with a board up.
 */
async function boardSignal(page) {
    return page.evaluate(() => {
        const c = document.querySelector('canvas');
        const g = c.getContext('webgl2') || c.getContext('webgl');
        if (!g) return { mean: -1, flat: -1 };
        const w = 400, h = 200;
        const x = Math.floor((c.width - w) / 2), y = Math.floor((c.height - h) / 2);
        const px = new Uint8Array(4 * w * h);
        g.readPixels(x, y, w, h, g.RGBA, g.UNSIGNED_BYTE, px);
        const bins = new Map();
        let sum = 0, n = 0;
        for (let i = 0; i < px.length; i += 4) {
            const r = px[i], gg = px[i + 1], b = px[i + 2];
            sum += (r + gg + b) / 3;
            n += 1;
            const key = ((r >> 4) << 8) | ((gg >> 4) << 4) | (b >> 4);
            bins.set(key, (bins.get(key) || 0) + 1);
        }
        let best = 0, bestKey = 0;
        for (const [k, v] of bins) if (v > best) { best = v; bestKey = k; }
        const mr = ((bestKey >> 8) & 15) * 16 + 8;
        const mg = ((bestKey >> 4) & 15) * 16 + 8;
        const mb = (bestKey & 15) * 16 + 8;
        let flat = 0;
        for (let i = 0; i < px.length; i += 4) {
            if (Math.abs(px[i] - mr) <= 14 && Math.abs(px[i + 1] - mg) <= 14 && Math.abs(px[i + 2] - mb) <= 14) flat += 1;
        }
        return { mean: Math.round(sum / n), flat: Math.round((flat / n) * 100) / 100 };
    });
}

const BOARD_FLAT = 0.6;   // level 0.39, board 0.75

/** Walk right until an owl opens a board. Flat ground, so no jumping. */
async function reachBoard(page) {
    for (let step = 0; step < 16; step += 1) {
        await page.keyboard.down('ArrowRight');
        await wait(page, 500);
        await page.keyboard.up('ArrowRight');
        await wait(page, 800);
        const sig = await boardSignal(page);
        if (sig.flat < BOARD_FLAT) continue;
        // A darkening that clears is the DEATH BEAT, not a board: it holds for
        // death.hold_ms and then reloads the level, while a board stays until it
        // is answered. The arena has no pits, but the check is cheap.
        await wait(page, 3000);
        const still = await boardSignal(page);
        if (still.flat >= BOARD_FLAT) return { reached: true, step, sig: still };
    }
    return { reached: false, sig: await boardSignal(page) };
}

const shot = (page, name) => page.screenshot({ path: resolve(SHOT_DIR, `${name}.png`) });

/** A real tab switch: a second page brought to front moves browser focus. */
async function tabSwitch(context, page, ms, label) {
    const other = await context.newPage();
    await other.goto(`data:text/html,<title>elsewhere</title><h1>${label}</h1>`);
    await other.bringToFront();
    await wait(other, ms);
    await page.bringToFront();
    await wait(page, 2500);
    await other.close();
}

async function main() {
    if (!readdirSync(WEB_DIR).some(f => /^index\.[0-9a-f]+\.wasm$/.test(f))) {
        console.error(`FAIL: no export at ${WEB_DIR}. Run: bash godot/tools/build_web.sh`);
        process.exit(1);
    }
    await mkdir(SHOT_DIR, { recursive: true });
    const server = serve();
    const errors = [];
    const findings = [];
    let browser;
    try {
        await new Promise(r => setTimeout(r, 700));
        browser = await chromium.launch({ executablePath: CHROMIUM });
        const context = await browser.newContext({ viewport: IPAD, hasTouch: true });
        const page = await context.newPage();
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

        await boot(page);
        await createProfile(page);

        // Persistence debounces its disk write by 0.5s and IDBFS batches its own
        // flush, so the file has to exist before it can be patched.
        await wait(page, 2500);
        const seeded = await seedStore(page, {
            flags: { 'levels/practice_arena_in_grid': true },
            tutorialsSeen: TUTORIAL_IDS,
        });
        console.log(`store seeded  : ${seeded.ok
            ? `arena flag + ${seeded.lessons} lessons in ${seeded.saveKey}${seeded.authored ? ' (authored)' : ''}`
            : 'FAILED - ' + seeded.reason}`);
        if (!seeded.ok) {
            console.error('INCONCLUSIVE: could not reach the practice arena');
            process.exitCode = 1;
            return;
        }
        await boot(page);                 // reload so Config reads the override
        await instrument(page);
        await enterArena(page);
        await shot(page, '01-level-entered');

        const found = await reachBoard(page);
        console.log(`board open    : ${found.reached} (flat ${found.sig.flat}, mean ${found.sig.mean})`);
        if (!found.reached) {
            console.error('INCONCLUSIVE: never got a maths board open, so the blur was never tested');
            process.exitCode = 1;
            return;
        }
        await shot(page, '02-board-open');

        const baseline = await focusState(page);
        console.log(`focus         : ${baseline.active} (canvas ${baseline.canvasHasFocus ? 'has' : 'HAS NOT'} focus)`);
        console.log('');

        // ── 1. A real tab switch, short then long. A child does not come back in
        // two seconds, and Godot's main loop and audio context behave differently
        // once the page has been hidden a while.
        for (const [ms, name] of [[2500, '2.5s tab switch'], [8000, '8s tab switch']]) {
            await tabSwitch(context, page, ms, name);
            const sig = await boardSignal(page);
            const st = await focusState(page);
            const heard = await keyReaches(page, 'ArrowRight');
            console.log(`after ${name.padEnd(16)}: board ${sig.flat >= BOARD_FLAT ? 'up  ' : 'GONE'}  focus ${st.active.padEnd(12)}  keys ${heard ? 'reach the game' : 'DO NOT REACH THE GAME'}`);
            if (sig.flat < BOARD_FLAT) findings.push(`the board did not survive a ${name}`);
            if (!heard) findings.push(`the keyboard was dead after a ${name}`);
        }
        await shot(page, '03-after-tab-switch');

        // ── 2. Focus leaving the canvas and landing NOWHERE. This is the case
        // that does not heal on its own -- the tab switches above recover because
        // the browser hands focus back to the element that had it, which nothing
        // does here. It is what Godot's own virtual-keyboard <input> leaves behind
        // (GodotDisplayVK.hide() blurs the input and never refocuses the canvas,
        // and every LineEdit in the game is served by that input on a touch build)
        // and what browser UI taking and dropping focus leaves behind.
        //
        // canvas.blur() is exactly that, and nothing more: no synthetic event the
        // engine would not see, no state the page could not reach on its own.
        await page.evaluate(() => {
            const c = document.getElementById('canvas') || document.querySelector('canvas');
            c.blur();
        });
        await wait(page, 800);
        {
            const st = await focusState(page);
            const heard = await keyReaches(page, 'ArrowRight');
            const sig = await boardSignal(page);
            console.log(`after ${'focus dropped'.padEnd(16)}: board ${sig.flat >= BOARD_FLAT ? 'up  ' : 'GONE'}  focus ${st.active.padEnd(12)}  keys ${heard ? 'reach the game' : 'DO NOT REACH THE GAME'}`);
            if (!heard) findings.push('the keyboard was dead once focus left the canvas with nowhere to go');
        }
        await shot(page, '04-after-focus-dropped');

        // ── 2b. The other half of the same fix, and the one that would break the
        // iPad if it were wrong: a real text field must KEEP focus. Godot serves
        // the login name and PIN through an injected <input>, and a fix that pulled
        // focus back to the canvas on sight would dismiss the on-screen keyboard
        // mid-word. So a field is focused here and must still hold focus a moment
        // later.
        const fieldKept = await page.evaluate(async () => {
            const field = document.createElement('input');
            field.type = 'text';
            field.id = 'crow-typing-probe';
            field.style.cssText = 'position:fixed;left:-300px;top:0';
            document.body.appendChild(field);
            field.focus();
            await new Promise(r => setTimeout(r, 600));
            const kept = document.activeElement === field;
            field.remove();
            return kept;
        });
        console.log(`text field    : ${fieldKept ? 'keeps focus (typing still works)' : 'LOST FOCUS - the fix is stealing it from LineEdits'}`);
        if (!fieldKept) findings.push('focus was pulled off a text field, which breaks typing a name or PIN');
        // The field removal above left focus nowhere; let the page settle so the
        // answerability test below is not measuring that instead.
        await wait(page, 800);

        // ── 3. Is the board still ANSWERABLE? A board that is drawn but no longer
        // takes an answer looks exactly like a healthy board in a screenshot.
        // One of the four options is correct, so 1..4 closes it unless input is
        // gone. Each wrong tap costs a 900ms retry lockout, so the waits are
        // longer than that; a correct one starts a 1500ms close.
        let answered = false;
        for (const digit of ['1', '2', '3', '4']) {
            await page.keyboard.press(`Digit${digit}`);
            await wait(page, 2200);
            if ((await boardSignal(page)).flat < BOARD_FLAT) { answered = true; break; }
        }
        await shot(page, '05-after-answer-attempt');

        // If the keyboard could not do it, a tap might: the options are a row
        // across the lower half of the board. This separates "all input is dead"
        // from "the keyboard path is dead", which are different bugs.
        let tapped = false;
        if (!answered) {
            for (const frac of [0.28, 0.43, 0.57, 0.72]) {
                await page.mouse.click(Math.round(IPAD.width * frac), Math.round(IPAD.height * 0.64));
                await wait(page, 2200);
                if ((await boardSignal(page)).flat < BOARD_FLAT) { tapped = true; break; }
            }
            await shot(page, '06-after-tap-attempt');
        }
        console.log(`answerable    : ${answered ? 'yes, from the keyboard'
            : tapped ? 'ONLY BY TAPPING - the keyboard is dead'
            : 'NO - neither a key nor a tap closed it'}`);
        if (!answered) findings.push(answered ? '' : tapped
            ? 'the board could only be answered by tapping after the blur'
            : 'the board could not be answered at all after the blur');

        console.log(`console errors: ${errors.length}`);
        for (const e of errors.slice(0, 6)) console.log(`  ERR ${e}`);
        console.log(`shots         : ${SHOT_DIR}`);
        console.log('');
        if (findings.length === 0 && errors.length === 0) {
            console.log('NOT REPRODUCED: the board survived every blur and stayed answerable.');
        } else {
            console.log('REPRODUCED:');
            for (const f of findings) console.log(`  - ${f}`);
            process.exitCode = 2;
        }
    } finally {
        if (browser) await browser.close();
        server.kill();
    }
}

main();
