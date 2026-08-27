/**
 * Where does a finger on the on-screen gamepad actually register?
 *
 * The report: "the touchpads werent bounded well, where i pressed it didnt seem
 * to register, sometimes it did sporadically - i dont know how much is comms
 * with the button pressing versus the space for pressing."
 *
 * That last clause is the right question and this answers it directly, by
 * separating the two things it names:
 *
 *   THE SPACE FOR PRESSING -- a scan across the bottom of the screen, pressing
 *   every few pixels, recording which x positions do something. The result is
 *   the pads' REAL hit area, measured rather than assumed, and it can be laid
 *   next to where they are drawn.
 *
 *   THE PRESSING ITSELF -- a hold, and a two-finger hold-and-tap. A pad that
 *   answers a poke but not a held thumb, or answers alone but not while another
 *   pad is held, is "sporadic" from the sofa and specific from here.
 *
 * Everything is a real touch event. page.mouse.click() takes a different path
 * through the engine and would prove nothing about a thumb.
 *
 * Run: node godot/tools/touch_pad_probe.mjs [--port 8075] [--shots <dir>]
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
const PORT = Number(argv.includes('--port') ? argv[argv.indexOf('--port') + 1] : 8075);
const SHOT_DIR = argv.includes('--shots')
    ? resolve(argv[argv.indexOf('--shots') + 1])
    : resolve(ROOT, 'output/pad-probe');

const IPAD = { width: 1180, height: 820 };
const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH].find(p => p && existsSync(p));

const NEW_PLAYER = { x: 590, y: 486 };
const NAME_FIELD = { x: 590, y: 176 };
const PIN_FIELD = { x: 590, y: 307 };
const PIN_CONFIRM = { x: 590, y: 443 };
const CREATE = { x: 590, y: 721 };

function serve() {
    return spawn(process.execPath, ['-e', `
        const http=require('http'),fs=require('fs'),path=require('path');
        const MIME={'.html':'text/html','.js':'text/javascript','.wasm':'application/wasm',
            '.pck':'application/octet-stream','.png':'image/png','.json':'application/json',
            '.svg':'image/svg+xml','.wav':'audio/wav','.mp3':'audio/mpeg'};
        http.createServer((req,res)=>{
            if(req.url.startsWith('/api/')){res.writeHead(200,{'content-type':'application/json'});
                return res.end('{}');}
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
    await page.keyboard.press('Enter');   // title screen takes any key
    await wait(page, 2500);
}

async function createProfile(page) {
    await page.mouse.click(NEW_PLAYER.x, NEW_PLAYER.y);
    await wait(page, 1500);
    for (const [field, text] of [[NAME_FIELD, 'Pads'], [PIN_FIELD, '1234'], [PIN_CONFIRM, '1234']]) {
        await page.mouse.click(field.x, field.y);
        await wait(page, 400);
        await page.keyboard.type(text, { delay: 60 });
        await wait(page, 400);
    }
    await page.mouse.click(CREATE.x, CREATE.y);
    await wait(page, 3500);
}

/** Turn the flat practice arena on for this browser, so nothing can fall. */
async function seedArena(page) {
    return page.evaluate(async () => {
        const open = name => new Promise((res, rej) => {
            const r = indexedDB.open(name);
            r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
        });
        let db;
        try { db = await open('/userfs'); } catch (e) { return { ok: false, reason: String(e) }; }
        const stores = [...db.objectStoreNames];
        if (!stores.length) return { ok: false, reason: 'no object stores' };
        const store = stores.includes('FILE_DATA') ? 'FILE_DATA' : stores[0];
        const reader = () => db.transaction([store], 'readonly').objectStore(store);
        const keys = await new Promise((res, rej) => {
            const r = reader().getAllKeys();
            r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
        });
        const FILE = [...keys].find(k => String(k).endsWith('/crow_localstorage.json'));
        if (!FILE) return { ok: false, reason: 'no save file yet' };
        const entry = await new Promise((res, rej) => {
            const r = reader().get(FILE);
            r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
        });
        const kv = JSON.parse(new TextDecoder().decode(entry.contents));
        kv['crow_flag_levels/practice_arena_in_grid'] = JSON.stringify(true);
        const patched = { ...entry, contents: new TextEncoder().encode(JSON.stringify(kv)), timestamp: new Date() };
        await new Promise((res, rej) => {
            const r = db.transaction([store], 'readwrite').objectStore(store).put(patched, FILE);
            r.onsuccess = () => res(); r.onerror = () => rej(r.error);
        });
        return { ok: true };
    });
}

async function enterArena(page) {
    await page.keyboard.press('Enter');
    await wait(page, 1800);
    await page.keyboard.press('ArrowRight');
    await wait(page, 700);
    await page.keyboard.press('Enter');
    await wait(page, 4000);
}

/**
 * Two fingerprints, because the report names two different things.
 *
 * WORLD -- the playfield above the pads. Does the crow actually move? That is
 * "comms with the button pressing": the action reached the game.
 *
 * PADS -- the strip the pads are drawn in. Does the pad light up under the
 * finger? TouchScreenButton only highlights when the press is inside its own
 * shape, so this is "the space for pressing", measured directly.
 *
 * Splitting them matters. A pad that lights but does not move the crow is a
 * wiring problem; one that never lights is a hit-area problem; and a single
 * pass/fail cannot tell a parent which.
 *
 * THE WORLD BAND WAS WRONG FIRST TIME and reported every press dead: it sampled
 * the top 55% of the canvas, and the crow stands at about 73% of the way down.
 * It was watching empty sky while the crow walked back and forth underneath it.
 */
function bandHash(page, fromFrac, toFrac, cellsX, cellsY) {
    return page.evaluate(({ fromFrac, toFrac, cellsX, cellsY }) => {
        const c = document.querySelector('canvas');
        const g = c.getContext('webgl2') || c.getContext('webgl');
        if (!g) return 'nogl';
        const w = c.width;
        // GL origin is bottom-left, so a band measured from the TOP of the page
        // starts at canvas.height - toFrac.
        const top = Math.floor(c.height * fromFrac);
        const bottom = Math.floor(c.height * toFrac);
        const h = bottom - top;
        const y = c.height - bottom;
        const px = new Uint8Array(4 * w * h);
        g.readPixels(0, y, w, h, g.RGBA, g.UNSIGNED_BYTE, px);
        const out = [];
        for (let cy = 0; cy < cellsY; cy += 1) {
            for (let cx = 0; cx < cellsX; cx += 1) {
                let sum = 0, n = 0;
                for (let yy = Math.floor(cy * h / cellsY); yy < Math.floor((cy + 1) * h / cellsY); yy += 3) {
                    for (let xx = Math.floor(cx * w / cellsX); xx < Math.floor((cx + 1) * w / cellsX); xx += 3) {
                        const o = (yy * w + xx) * 4;
                        sum += (px[o] + px[o + 1] + px[o + 2]) / 3;
                        n += 1;
                    }
                }
                out.push(Math.round(sum / Math.max(1, n) / 8));
            }
        }
        return out.join(',');
    }, { fromFrac, toFrac, cellsX, cellsY });
}

// The crow stands around 73% down; the pads start at about 81%.
const worldHash = (page) => bandHash(page, 0.30, 0.80, 32, 12);
const padsHash = (page) => bandHash(page, 0.80, 1.00, 48, 4);

function changed(a, b) {
    if (a === b) return 0;
    const A = a.split(','), B = b.split(',');
    let n = 0;
    for (let i = 0; i < A.length; i += 1) if (A[i] !== B[i]) n += 1;
    return n;
}

/**
 * Hold a finger down and report BOTH: whether the pad lit, and whether the
 * world moved. The pad reading is taken while the finger is still down, because
 * the highlight goes away the instant it lifts.
 */
async function hold(cdp, page, x, y, ms) {
    const worldBefore = await worldHash(page);
    const padsBefore = await padsHash(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await wait(page, Math.max(120, Math.floor(ms / 2)));
    const padsDuring = await padsHash(page);
    await wait(page, Math.max(80, Math.floor(ms / 2)));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await wait(page, 300);
    return {
        lit: changed(padsBefore, padsDuring),
        moved: changed(worldBefore, await worldHash(page)),
    };
}

/** Two fingers: hold at A, then land B while A is still down. */
async function holdAndTap(cdp, page, a, b, ms) {
    const before = await worldHash(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y, id: 1 }] });
    await wait(page, 300);
    await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: a.x, y: a.y, id: 1 }, { x: b.x, y: b.y, id: 2 }],
    });
    await wait(page, ms);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: a.x, y: a.y, id: 1 }] });
    await wait(page, 200);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await wait(page, 500);
    return changed(before, await worldHash(page));
}

const shot = (page, name) => page.screenshot({ path: resolve(SHOT_DIR, `${name}.png`) });

async function main() {
    if (!readdirSync(WEB_DIR).some(f => /^index\.[0-9a-f]+\.wasm$/.test(f))) {
        console.error(`FAIL: no export at ${WEB_DIR}. Run: bash godot/tools/build_web.sh`);
        process.exit(1);
    }
    await mkdir(SHOT_DIR, { recursive: true });
    const server = serve();
    const errors = [];
    let browser;
    try {
        await new Promise(r => setTimeout(r, 700));
        browser = await chromium.launch({ executablePath: CHROMIUM });
        const context = await browser.newContext({ viewport: IPAD, hasTouch: true, isMobile: true });
        const page = await context.newPage();
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

        await boot(page);
        await createProfile(page);
        await wait(page, 2500);
        const seeded = await seedArena(page);
        console.log(`arena flag  : ${seeded.ok ? 'seeded' : 'FAILED - ' + seeded.reason}`);
        if (!seeded.ok) { process.exitCode = 1; return; }
        await boot(page);
        await enterArena(page);
        await shot(page, '01-arena');

        // ── The space for pressing: a scan along the pad row. One CDP session
        // for the whole run: opening one per press made the scan take minutes.
        const cdp = await context.newCDPSession(page);
        const padY = Math.round(IPAD.height * 0.885);
        const STEP = 12;
        const map = [];
        for (let x = 20; x < IPAD.width; x += STEP) {
            const r = await hold(cdp, page, x, padY, 420);
            map.push({ x, ...r, live: r.lit >= 1 });
        }
        await shot(page, '02-after-scan');

        const bands = [];
        for (const m of map) {
            if (!m.live) continue;
            const last = bands[bands.length - 1];
            if (last && m.x - last.to <= STEP * 1.5) last.to = m.x;
            else bands.push({ from: m.x, to: m.x });
        }
        console.log(`\nscan at y=${padY}, every ${STEP}px, holding 420ms each`);
        console.log(`   pads that LIT       : ${bands.length ? bands.map(b => `${b.from}..${b.to}`).join('  ') : 'NONE'}`);
        console.log(`   lit                 : ${map.map(m => (m.live ? '#' : '.')).join('')}`);
        console.log(`   world moved         : ${map.map(m => (m.moved >= 3 ? '#' : '.')).join('')}`);

        // ── The pressing itself, on the widest band that lit.
        const widest = bands.slice().sort((a, b) => (b.to - b.from) - (a.to - a.from))[0];
        if (widest) {
            const cx = Math.round((widest.from + widest.to) / 2);
            const short = await hold(cdp, page, cx, padY, 120);
            const long = await hold(cdp, page, cx, padY, 1200);
            console.log(`\n   a 120ms poke   -> lit ${short.lit}, world moved ${short.moved}  ${short.moved >= 3 ? 'ok' : 'NO EFFECT'}`);
            console.log(`   a 1200ms hold  -> lit ${long.lit}, world moved ${long.moved}  ${long.moved >= 3 ? 'ok' : 'NO EFFECT'}`);
            const both = await holdAndTap(cdp, page, { x: cx, y: padY }, { x: IPAD.width - 90, y: padY }, 700);
            console.log(`   two fingers    -> world moved ${both}  ${both >= 3 ? 'ok' : 'NO EFFECT'}`);
        }
        await cdp.detach();

        console.log(`\nconsole errors: ${errors.length}`);
        for (const e of errors.slice(0, 5)) console.log(`  ERR ${e}`);
        console.log(`shots: ${SHOT_DIR}`);
    } finally {
        if (browser) await browser.close();
        server.kill();
    }
}

main();
