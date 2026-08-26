/**
 * Level walkthrough capture — photographs EVERY part of EVERY reachable level.
 *
 * What this is: a level designer's contact sheet. It serves the exported
 * output/web build, boots it in Chromium at the owner's iPad viewport, unlocks
 * the whole level list, then enters each level in turn and walks the crow from
 * spawn to the right-hand map edge, writing a PNG every step. The steps overlap
 * (the crow travels less than one screen-width per step) so the strip of images
 * for a level reads as a continuous side-scroll of that level, not a set of
 * disconnected postcards.
 *
 * What this is NOT: a gate, and not a substitute for measuring geometry. A
 * screenshot cannot fail a build, and it cannot tell you a gap is three tiles
 * wide — the compiled map JSON in godot/data/levels/compiled/ is the authority
 * for that, and this script reads it only to decide how far it has to walk. Nor
 * is it a play-test: the walk is a dumb hold-right-and-jump heuristic, so where
 * it stalls tells you a level has a shape a robot cannot solve, and where it
 * sails through tells you nothing about whether a six-year-old enjoys it.
 *
 * Usage:
 *   node godot/tools/level_walkthrough.mjs
 *   node godot/tools/level_walkthrough.mjs --levels level_07,level_08
 *   node godot/tools/level_walkthrough.mjs --out /tmp/shots --port 8062
 *
 * Output: output/level-shots/<level_key>-<NN>.png, plus a manifest JSON next to
 * them. Re-running overwrites the same filenames, so the directory is always the
 * latest run rather than an accumulating pile — that is what makes it safe to
 * point a reviewer at a path and re-run behind them.
 *
 * ── Three things here are not obvious, and all three were learned the hard way.
 *
 * 1. LEVEL SELECT HIDES LOCKED LEVELS, so you cannot photograph level 8 from a
 *    fresh save. `level_select.gd::_is_unlocked()` gates on
 *    `SaveManager.get_data()["completedLevels"]`, which lands in `user://` via
 *    Persistence — and on the Web export `user://` is an Emscripten IDBFS mount
 *    at /userfs, persisted into an IndexedDB database literally named "/userfs".
 *    So the unlock is seeded by *editing that IndexedDB record and reloading*:
 *    boot once to make the profile (which creates the file with the right
 *    IDBFS envelope), patch `completedLevels` inside it, reload, and Godot's
 *    syncfs(populate) pulls the patched save back in at boot. Writing the record
 *    from scratch would mean guessing IDBFS's store name and value shape; making
 *    the game write it first and only editing the payload does not.
 *
 * 2. OWLS BLOCK THE WALK. An owl auto-triggers its math challenge when the
 *    player enters its 96x96 zone (npc.gd), and `game.gd::launch_math_challenge`
 *    calls `_player.set_physics_process(false)` — so an unanswered board freezes
 *    the crow forever and the walk stops dead at the first owl. The board cannot
 *    be dismissed from the keyboard either: AnswerButton deliberately takes no
 *    focus, so there is nothing for Enter to activate. Hence the click sweep
 *    below: a short fan of clicks across where the answer row sits, fired every
 *    step. Two wrong answers close the board (math_challenge.gd reveals and
 *    dismisses on the second miss) and the owl then holds a 2000ms cooldown —
 *    ample time to run the 96px out of its zone at 160px/s. Answering *wrongly
 *    on purpose* is the right call for a capture tool: it is the only outcome
 *    reachable without reading the question, and it costs the walk nothing.
 *
 * 3. A MISS RESTARTS THE LEVEL AT THE SPAWN. `game.gd::hurt_player` respawns at
 *    `spawn_point`, and there are no checkpoints — so a pit fall or a cockroach
 *    at 90% of the way through sends the crow back to tile 2. The walk therefore
 *    budgets generously (WALK_MARGIN) rather than assuming a clean run, and the
 *    contact sheet is expected to contain repeats. Repeats are themselves a
 *    finding: a level whose strip loops back to the spawn three times is a level
 *    that punishes one mistake with the whole level.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { spawn } from 'child_process';
import { mkdir, writeFile, rm } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const WEB_DIR = resolve(ROOT, 'output/web');
const GODOT_DIR = resolve(ROOT, 'godot');

function arg(name, fallback) {
    const i = process.argv.indexOf(name);
    return i === -1 ? fallback : process.argv[i + 1];
}

const PORT = Number(arg('--port', 8062));
const OUT_DIR = resolve(ROOT, arg('--out', 'output/level-shots'));
const ONLY = (arg('--levels', '') || '').split(',').map(s => s.trim()).filter(Boolean);

const EXECUTABLE_CANDIDATES = [
    process.env.CHROMIUM_PATH,
    '/opt/pw-browsers/chromium',
    '/opt/pw-browsers/chromium-1091/chrome-linux/chrome',
].filter(Boolean);
const resolveChromium = () => EXECUTABLE_CANDIDATES.find(existsSync);

// iPad (10th gen) CSS viewport in landscape — the owner's primary device class,
// and the same one web_boot_smoke.mjs uses, so shots from the two are comparable.
const IPAD = { width: 1180, height: 820 };

// project.godot: 960x540 base viewport, stretch mode canvas_items, aspect expand.
// At 1180x820 the scale is min(1180/960, 820/540) = 1.229, so the camera shows
// 960 world px across. That is the number that makes the steps overlap: the crow
// must travel LESS than 960px between shots or the strip has holes in it.
const WORLD_PX_PER_SCREEN = 960;
// data/tuning/player_base.json
const MAX_SPEED = 160;
// How much of a screen-width the crow is allowed to cover between shots.
const STEP_ADVANCE = 0.45;
const STEP_MS = Math.round((WORLD_PX_PER_SCREEN * STEP_ADVANCE / MAX_SPEED) * 1000);
// The walk is not a clean run: it stalls on owls, falls in pits and restarts at
// the spawn. Budget several times the theoretical crossing time so a level that
// costs the crow one or two restarts is still photographed to its end.
const WALK_MARGIN = 2.0;
const MAX_STEPS = 44;
/**
 * How the crow is driven, cycled step by step. `rightMs`/`releaseMs` pulse the
 * run; `jumpMs` is the tap interval.
 *
 * HOLDING RIGHT IS NOT ENOUGH, and finding out why is the most useful thing this
 * harness learned. With right held down the crow is always at maxSpeed, so every
 * jump is a MAXIMUM-distance jump: 2 * 475 / 800 = 1.19s of airtime at 160px/s
 * is 190px, or 5.9 tiles. That clears every pit in the game twice over — and it
 * makes the staircases in levels 6-8 unsolvable, because their steps are three
 * tiles wide, two tiles apart and three tiles up, so a full-length jump sails
 * clean over the step it was aimed at and lands in the one-tile pit past it.
 *
 * Climbing those needs AIR CONTROL: jump, then let go of right so the crow drifts
 * only a tile or two before coming down. Under drag 800 it stops in 0.2s, so a
 * 250ms hold plus the coast is about 1.7 tiles — which is exactly the two-tile
 * step. That is a real skill the level demands and a plain hold-right bot does
 * not have, which is why some of these patterns pulse.
 *
 * Cycled rather than tuned, because death restarts the level at the spawn (there
 * are no checkpoints), so a level is attempted many times over one run and
 * identical attempts would fail identically. Which pattern a level needs is
 * itself a finding: terrain that only yields to one rhythm has exactly one
 * solution to each of its jumps.
 *
 * Held for PATTERN_RUN steps at a time, not swapped every step. One step is only
 * a couple of seconds and the pulsed patterns advance slowly, so alternating
 * every step meant the crow died under `sprint-hop`, restarted at the spawn,
 * short-hopped a few tiles, and got sprinted into the same pit again — it never
 * held one rhythm long enough to finish a climb.
 */
const PATTERN_RUN = 4;
const DRIVE_PATTERNS = [
    { label: 'sprint-hop', rightMs: 0, releaseMs: 0, jumpMs: 230 },   // right held, continuous hops
    { label: 'short-hop', rightMs: 260, releaseMs: 420, jumpMs: 520 },  // pulsed: climbs staircases
    { label: 'run', rightMs: 0, releaseMs: 0, jumpMs: 900 },   // right held, occasional jump
    { label: 'creep-hop', rightMs: 200, releaseMs: 520, jumpMs: 700 },  // pulsed shorter still
];

// Where a board's buttons land, in CSS pixels — see note 2 in the header.
//
// Both boards centre a horizontal row of option buttons: math_challenge.gd uses
// 116x88 with 16px separation, math_tutorial.gd 108x84. Scaled by 1.229 that is
// a row of ~135px buttons centred on x=590, so the button centres depend only on
// HOW MANY options the problem has. These are the centres for a row of two,
// three and four, unioned — a superset that is right for every case and wrong
// for none, which is what a blind sweep needs.
const ANSWER_XS = [362, 437, 514, 590, 666, 743, 818];
// The row's y is the part that genuinely moves: it is the last child of a board
// whose height grows with a word problem, a hint line or a counting row, and the
// board is vertically centred, so the row slides down as the question gets
// longer. Swept rather than predicted.
// Kept to three: every click is three CDP round-trips, and a sweep is fired on
// every step of every level, so this row count is the single biggest lever on how
// long a whole run takes. Four y values put a nine-level run past ninety minutes.
const ANSWER_YS = [520, 570, 620];
// math_tutorial.gd puts a 150x56 GHOST "Skip" in the board's top-right corner —
// the one control that closes a lesson outright. Worth three tries at the y it
// can sit at, because a tutorial that will not close stalls the whole walk: its
// choice cards call grab_focus() on an AnswerButton, which has FOCUS_NONE, so
// there is nothing on them the keyboard can reach at all.
const SKIP_POINTS = [[871, 193], [871, 232]];

function levels() {
    const reg = JSON.parse(readFileSync(resolve(GODOT_DIR, 'data/levels/level_registry.json'), 'utf8'));
    return reg.levels.map(l => {
        const map = JSON.parse(readFileSync(resolve(GODOT_DIR, l.mapFile), 'utf8'));
        return { key: l.key, name: l.name, widthPx: map.width * map.tilewidth, tiles: map.width };
    });
}

/** Serve the export, answering /api/* the way the production edge does. */
function serve() {
    return spawn(process.execPath, ['-e', `
        const http = require('http'), fs = require('fs'), path = require('path');
        const MIME = { '.html':'text/html', '.js':'text/javascript', '.wasm':'application/wasm',
            '.pck':'application/octet-stream', '.png':'image/png', '.json':'application/json',
            '.svg':'image/svg+xml', '.wav':'audio/wav', '.mp3':'audio/mpeg' };
        http.createServer((req, res) => {
            if (req.url.startsWith('/api/')) {
                res.writeHead(200, {'content-type':'application/json'});
                return res.end(req.url.startsWith('/api/v1/auth/session') ? '{"enrolled":false}' : '{}');
            }
            const p = path.join(${JSON.stringify(WEB_DIR)}, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
            fs.readFile(p, (err, body) => {
                if (err) { res.writeHead(404).end('not found'); return; }
                res.writeHead(200, {'content-type': MIME[path.extname(p)] || 'application/octet-stream'});
                res.end(body);
            });
        }).listen(${PORT}, '127.0.0.1');
    `], { stdio: 'ignore' });
}

/** Load the page and wait until the engine has a sized canvas and a live scene. */
async function boot(page, url) {
    await page.goto(url, { waitUntil: 'load', timeout: 180_000 });
    await page.waitForFunction(() => {
        const c = document.querySelector('canvas');
        return c && c.width > 0 && c.height > 0;
    }, { timeout: 240_000 });
    // boot.gd routes on to the menu after a 0.4s beat; the pck is 35MB, so the
    // gap between "canvas sized" and "first real scene" is seconds, not frames.
    await page.waitForTimeout(9000);
}

/**
 * Make a profile so there is a save file to patch, and so later boots land on
 * the main menu rather than the login screen.
 *
 * This is the one place the harness cannot be layout-blind. web_boot_smoke.mjs
 * clicks the canvas centre and types, which is enough to *exercise* the screen —
 * but it does not actually create anything, because the name and PIN are
 * separate LineEdits and neither holds focus until it is clicked. A blind click
 * plus typing leaves both fields empty, Create refuses, and the run continues
 * with no profile and therefore no save to unlock. So the three fields are
 * clicked at the positions login.gd lays them out at on this viewport, and the
 * result is checked (by whether a save appears) rather than assumed.
 */
const NEW_PLAYER_BUTTON = { x: 590, y: 486 };
const NAME_FIELD = { x: 590, y: 200 };
const PIN_FIELD = { x: 590, y: 330 };
const CREATE_BUTTON = { x: 590, y: 608 };

async function createProfile(page) {
    // With no profiles stored, login.gd opens on "Who's playing?" with a single
    // centred "New player" button; that is what brings up the make-a-player form.
    await page.mouse.click(NEW_PLAYER_BUTTON.x, NEW_PLAYER_BUTTON.y);
    await page.waitForTimeout(1500);
    await page.mouse.click(NAME_FIELD.x, NAME_FIELD.y);
    await page.waitForTimeout(300);
    await page.keyboard.type('Audit', { delay: 60 });
    await page.waitForTimeout(300);
    await page.mouse.click(PIN_FIELD.x, PIN_FIELD.y);
    await page.waitForTimeout(300);
    await page.keyboard.type('1234', { delay: 60 });
    await page.waitForTimeout(400);
    await page.mouse.click(CREATE_BUTTON.x, CREATE_BUTTON.y);
    await page.waitForTimeout(3000);
}

/**
 * Mark every level complete inside the IDBFS-backed save, so level select shows
 * all of them. See note 1 in the header for why this edits a record the game
 * wrote rather than writing one.
 */
async function seedUnlocks(page, keys) {
    return page.evaluate(async (keys) => {
        const open = name => new Promise((res, rej) => {
            const r = indexedDB.open(name);
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
        });
        let db;
        try { db = await open('/userfs'); } catch (e) { return { ok: false, reason: `open /userfs: ${e}` }; }
        const stores = [...db.objectStoreNames];
        if (!stores.length) return { ok: false, reason: 'IndexedDB /userfs has no object stores' };
        const store = stores.includes('FILE_DATA') ? 'FILE_DATA' : stores[0];
        const get = key => new Promise((res, rej) => {
            const r = db.transaction([store], 'readonly').objectStore(store).get(key);
            r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
        });
        const allKeys = await new Promise((res, rej) => {
            const r = db.transaction([store], 'readonly').objectStore(store).getAllKeys();
            r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
        });
        // Discovered, not hardcoded. Godot's user:// is not the mount root: it is
        // `<mount>/godot/app_userdata/<project name>/`, and the project name is
        // "Hörmann" — a non-ASCII directory whose exact bytes are not worth
        // asserting from a test harness. Find the file by its leaf name instead.
        const PATH = [...allKeys].find(k => String(k).endsWith('/crow_localstorage.json'));
        const entry = PATH ? await get(PATH) : null;
        if (!entry || !entry.contents) {
            return { ok: false, reason: 'no crow_localstorage.json in IndexedDB', store, files: [...allKeys] };
        }
        // Persistence keeps the whole localStorage-equivalent key space in this
        // one JSON file, so the save blob is a *string value* inside it.
        const kv = JSON.parse(new TextDecoder().decode(entry.contents));
        // The save blob may not exist yet: SaveManager only writes on a game
        // event (a coin, a level end), so a profile that has never played has a
        // profile record and no save. In that case write the minimum SaveManager
        // will accept — `version` at SAVE_VERSION plus the unlock list. Its
        // load_save() shallow-merges a parsed save over _create_default_save(),
        // so every other field arrives from the defaults and this cannot drift
        // when the default shape grows.
        const active = kv['crow_active_user'];
        const saveKey = Object.keys(kv).find(k => k.startsWith('crow_save_'))
            || (active ? `crow_save_${active}` : 'crow_save_v1');
        const save = kv[saveKey] ? JSON.parse(kv[saveKey]) : { version: 1 };
        const synthesised = !kv[saveKey];
        save.completedLevels = keys;
        kv[saveKey] = JSON.stringify(save);
        const patched = { ...entry, contents: new TextEncoder().encode(JSON.stringify(kv)), timestamp: new Date() };
        await new Promise((res, rej) => {
            const r = db.transaction([store], 'readwrite').objectStore(store).put(patched, PATH);
            r.onsuccess = () => res(); r.onerror = () => rej(r.error);
        });
        return { ok: true, store, path: PATH, saveKey, synthesised, activeUser: active ?? null, completedLevels: keys };
    }, keys);
}

/**
 * Menu -> level select -> the Nth unlocked world -> playing.
 *
 * Driven entirely by focus and Enter rather than by clicking cards. The cards
 * live in a ScrollContainer that snaps, so a card's screen position depends on
 * scroll state; its focus order does not. Locked cards set FOCUS_NONE
 * (world_card.gd), so ui_right naturally walks only the reachable ones — which
 * also means this still works when the unlock seeding fails, it just cannot
 * reach as far.
 */
async function enterLevel(page, index) {
    await page.keyboard.press('Enter');          // main_menu: PLAY holds focus
    await page.waitForTimeout(1800);
    for (let i = 0; i < index; i += 1) {
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(260);
    }
    await page.waitForTimeout(600);
    await page.keyboard.press('Enter');          // level_select: the focused card
    await page.waitForTimeout(3200);             // level build + spawn + camera settle
}

/**
 * Fan clicks across the answer row so an owl's board cannot stall the walk.
 *
 * Fired every step regardless of whether a board is up: there is no way to ask
 * a canvas what scene it is showing, and a click into empty mid-screen air
 * during normal play does nothing — the HUD is along the top and the touch pads
 * are in the bottom corners, so this band is unclaimed.
 */
async function unblock(page) {
    for (const [x, y] of SKIP_POINTS) {
        await page.mouse.click(x, y);
    }
    for (const y of ANSWER_YS) {
        for (const x of ANSWER_XS) {
            await page.mouse.click(x, y);
            await page.waitForTimeout(25);
        }
    }
}

/**
 * Drive the crow right for one step's worth of time under one pattern.
 *
 * Jump is buffered (jumpBufferMs 100) and coyote-timed (coyoteMs 80) in
 * player_motion.gd, so a tap slightly early or slightly late off a ledge still
 * fires — which is what makes a blind rhythm able to clear ledges at all.
 */
async function drive(page, pattern) {
    const deadline = Date.now() + STEP_MS;
    if (pattern.rightMs === 0) {
        await page.keyboard.down('ArrowRight');
        try {
            while (Date.now() < deadline) {
                await page.waitForTimeout(pattern.jumpMs);
                await page.keyboard.press('Space');
            }
        } finally {
            await page.keyboard.up('ArrowRight');
        }
        return;
    }
    // Pulsed: jump on the leading edge of each pulse, so the crow takes off while
    // moving and then loses its horizontal speed in the air. That short hop is
    // the only way onto a step two tiles away and three tiles up.
    while (Date.now() < deadline) {
        await page.keyboard.down('ArrowRight');
        await page.keyboard.press('Space');
        await page.waitForTimeout(pattern.rightMs);
        await page.keyboard.up('ArrowRight');
        await page.waitForTimeout(pattern.releaseMs);
    }
}

/** Walk one level start to end, writing a shot per step. */
async function walk(page, level, outDir) {
    const crossingMs = (level.widthPx / MAX_SPEED) * 1000;
    const steps = Math.min(MAX_STEPS, Math.ceil((crossingMs * WALK_MARGIN) / STEP_MS));
    const shots = [];
    for (let s = 0; s < steps; s += 1) {
        const name = `${level.key}-${String(s + 1).padStart(2, '0')}.png`;
        await page.screenshot({ path: resolve(outDir, name) });
        shots.push(name);
        await drive(page, DRIVE_PATTERNS[Math.floor(s / PATTERN_RUN) % DRIVE_PATTERNS.length]);
        // The click sweep runs with the crow standing still. Sweeping while it is
        // still moving cost it a whole second of unjumped running, which is more
        // than enough to walk into the first pit — and it dies there, back at the
        // spawn, for the rest of the run.
        await unblock(page);
    }
    return shots;
}

async function main() {
    if (!readdirSync(WEB_DIR).some(f => /^index\.[0-9a-f]+\.wasm$/.test(f))) {
        console.error(`FAIL: no export found at ${WEB_DIR}. Run: bash godot/tools/build_web.sh`);
        process.exit(1);
    }
    const all = levels();
    // --levels is captured in the order it was written, not registry order, so a
    // run that has to be cut short can be pointed at the levels under review
    // first. Registry order is the default.
    const wanted = ONLY.length ? ONLY.map(k => all.find(l => l.key === k)).filter(Boolean) : all;
    if (!wanted.length) {
        console.error(`FAIL: --levels matched nothing. Known keys: ${all.map(l => l.key).join(', ')}`);
        process.exit(1);
    }

    // Idempotent: the directory is the latest run, not an archive of every run.
    await rm(OUT_DIR, { recursive: true, force: true });
    await mkdir(OUT_DIR, { recursive: true });

    const url = `http://127.0.0.1:${PORT}/`;
    const server = serve();
    const consoleErrors = [];
    let browser;
    const manifest = { viewport: IPAD, stepMs: STEP_MS, levels: [] };
    try {
        await new Promise(r => setTimeout(r, 700));
        browser = await chromium.launch({ executablePath: resolveChromium() });
        // ONE context for the whole run. IndexedDB is scoped to it, so the seeded
        // save survives every page reload below; a fresh context per level would
        // silently re-lock everything.
        const context = await browser.newContext({ viewport: IPAD, hasTouch: true, isMobile: false });
        const page = await context.newPage();
        page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

        console.log('boot 1/2: creating a profile so there is a save to patch');
        await boot(page, url);
        await createProfile(page);
        // Persistence debounces disk writes by 0.5s and IDBFS auto-persists a
        // beat after that; give both room before reading the record.
        await page.waitForTimeout(3000);

        const seed = await seedUnlocks(page, all.map(l => l.key));
        manifest.seed = seed;
        console.log(`unlock seeding : ${seed.ok ? `ok (${seed.saveKey} in ${seed.store})` : `FAILED — ${seed.reason}`}`);
        if (!seed.ok) {
            console.log('               only levels reachable from a fresh save will be captured');
            console.log(`               detail: ${JSON.stringify(seed)}`);
        }

        for (const level of wanted) {
            const index = all.findIndex(l => l.key === level.key);
            console.log(`capture: ${level.key} (${level.name}) — ${level.tiles} tiles / ${level.widthPx}px`);
            await boot(page, url);
            await enterLevel(page, index);
            const began = Date.now();
            const shots = await walk(page, level, OUT_DIR);
            const seconds = Math.round((Date.now() - began) / 1000);
            manifest.levels.push({ ...level, selectIndex: index, shots: shots.length, walkSeconds: seconds });
            console.log(`         ${shots.length} shots in ${seconds}s -> ${shots[0]} .. ${shots[shots.length - 1]}`);
        }

        manifest.consoleErrors = consoleErrors;
        await writeFile(resolve(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
        console.log(`\nwrote ${manifest.levels.reduce((n, l) => n + l.shots, 0)} shots to ${OUT_DIR}`);
        console.log(`console errors: ${consoleErrors.length}`);
        for (const e of consoleErrors.slice(0, 5)) console.log(`  ERR ${e}`);
    } finally {
        if (browser) await browser.close();
        server.kill('SIGTERM');
    }
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
