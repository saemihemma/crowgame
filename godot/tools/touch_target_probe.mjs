/**
 * Do the buttons work when a FINGER presses them?
 *
 * The report: "feels like the touching zone of the ui buttons is not correct - i
 * at least have a hard time hitting them", "make sure this is in portrait and
 * landscape, felt a bit different", and "i couldnt get further bc of controls".
 *
 * WHY NOTHING CAUGHT THIS. Every harness in this repo drives the game with
 * page.mouse.click(). A mouse click is a different event path from a finger:
 * Godot's web build takes touchstart/touchmove/touchend and turns them into
 * InputEventScreenTouch and InputEventScreenDrag, and a Control inside a
 * ScrollContainer can have its press stolen by the container's own touch
 * panning. So a bug that only exists under a finger is invisible to every check
 * that has ever run here -- the same shape of blind spot as the iPad keyboard,
 * which a viewport emulated and an input method did not.
 *
 * This taps with real touch events, in BOTH orientations, and decides whether a
 * tap landed by asking whether the screen changed. That is deliberately dumb: it
 * cannot be fooled by a button that lights up without acting, because a lit
 * button that does nothing leaves the next screen unreached.
 *
 * Run: node godot/tools/touch_target_probe.mjs [--port 8074] [--shots <dir>]
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
const PORT = Number(argv.includes('--port') ? argv[argv.indexOf('--port') + 1] : 8074);
const SHOT_DIR = argv.includes('--shots')
    ? resolve(argv[argv.indexOf('--shots') + 1])
    : resolve(ROOT, 'output/touch-probe');

// The same device, held both ways.
const ORIENTATIONS = [
    { name: 'landscape', viewport: { width: 1180, height: 820 } },
    { name: 'portrait', viewport: { width: 820, height: 1180 } },
];
const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH].find(p => p && existsSync(p));

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

/**
 * A cheap fingerprint of the frame, for "did anything happen".
 *
 * Coarse buckets over a grid, so an animation or a bobbing crow does not read as
 * a screen change while a whole new screen certainly does.
 */
async function frameHash(page) {
    return page.evaluate(() => {
        const c = document.querySelector('canvas');
        const g = c.getContext('webgl2') || c.getContext('webgl');
        if (!g) return 'nogl';
        const w = Math.min(c.width, 640), h = Math.min(c.height, 480);
        const x = Math.floor((c.width - w) / 2), y = Math.floor((c.height - h) / 2);
        const px = new Uint8Array(4 * w * h);
        g.readPixels(x, y, w, h, g.RGBA, g.UNSIGNED_BYTE, px);
        const CELLS = 8;
        const out = [];
        for (let cy = 0; cy < CELLS; cy += 1) {
            for (let cx = 0; cx < CELLS; cx += 1) {
                let sum = 0, n = 0;
                for (let yy = Math.floor(cy * h / CELLS); yy < Math.floor((cy + 1) * h / CELLS); yy += 4) {
                    for (let xx = Math.floor(cx * w / CELLS); xx < Math.floor((cx + 1) * w / CELLS); xx += 4) {
                        const o = (yy * w + xx) * 4;
                        sum += (px[o] + px[o + 1] + px[o + 2]) / 3;
                        n += 1;
                    }
                }
                out.push(Math.round(sum / Math.max(1, n) / 16));
            }
        }
        return out.join(',');
    });
}

function differs(a, b) {
    if (a === b) return 0;
    const A = a.split(','), B = b.split(',');
    let n = 0;
    for (let i = 0; i < A.length; i += 1) if (A[i] !== B[i]) n += 1;
    return n;
}

/** Press somewhere and report whether the screen moved because of it. */
async function press(page, x, y, label, how) {
    const before = await frameHash(page);
    if (how === 'touch') await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
    await wait(page, 1600);
    const after = await frameHash(page);
    const cells = differs(before, after);
    return { label, how, x: Math.round(x), y: Math.round(y), cells, landed: cells >= 6 };
}
const tap = (page, x, y, label) => press(page, x, y, label, 'touch');

async function boot(page) {
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 180_000 });
    await page.waitForFunction(() => {
        const c = document.querySelector('canvas');
        return c && c.width > 0 && c.height > 0;
    }, { timeout: 240_000 });
    await wait(page, 9000);
}

/** Is the portrait rotate-hint overlay covering the page? */
async function rotateHint(page) {
    return page.evaluate(() => {
        const el = document.getElementById('crow-rotate');
        if (!el) return { present: false };
        const css = getComputedStyle(el);
        return {
            present: true,
            showing: css.display !== 'none',
            covers: css.position === 'fixed' && css.display !== 'none',
        };
    });
}

const shot = (page, name) => page.screenshot({ path: resolve(SHOT_DIR, `${name}.png`) });

/**
 * Find the PRIMARY button on screen by its colour, and return where it is drawn.
 *
 * WHY NOT A COORDINATE. The first version of this probe tapped fixed fractions
 * of the viewport, which is fine until the viewport is a different shape -- in
 * portrait every one of them missed, and the probe reported the buttons dead when
 * what was dead was its arithmetic. The point here is to compare where a button
 * IS DRAWN against where it ANSWERS A FINGER, so the drawn position has to be
 * measured, not assumed.
 *
 * The primary button is the one bright warm block on these screens (BrandButton's
 * PRIMARY role paints it in the theme's coin). Returned in CSS pixels, which is
 * what page.touchscreen.tap takes.
 */
async function primaryButtonRect(page) {
    return page.evaluate(() => {
        const c = document.querySelector('canvas');
        const g = c.getContext('webgl2') || c.getContext('webgl');
        if (!g) return null;
        const W = c.width, H = c.height;
        const px = new Uint8Array(4 * W * H);
        g.readPixels(0, 0, W, H, g.RGBA, g.UNSIGNED_BYTE, px);
        // Coin, measured off the real frame: the button fill is (255,201,60) and
        // the two things that fooled the first version of this were the sunset
        // sky at (221,170,134) and (216,192,167). Blue under 110 rules both out;
        // an earlier "b < 120 && r-b > 90" did not, and the probe reported the
        // button as a 10407-pixel region covering half the screen.
        const isCoin = (r, gg, b) => r >= 245 && gg >= 180 && gg <= 225 && b <= 110;
        let minX = W, minY = H, maxX = -1, maxY = -1, hits = 0;
        // The language chips are coin-coloured too and live along the very top.
        // In GL coordinates the top of the screen is the HIGH y, so this drops it.
        const topCut = Math.floor(H * 0.88);
        for (let y = 0; y < topCut; y += 2) {
            for (let x = 0; x < W; x += 2) {
                const o = (y * W + x) * 4;
                if (!isCoin(px[o], px[o + 1], px[o + 2])) continue;
                hits += 1;
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
        }
        if (hits < 200 || maxX < 0) return null;
        // readPixels is bottom-left origin; the page is top-down.
        const cssX = (v) => v * (c.clientWidth / W);
        const cssY = (v) => (H - v) * (c.clientHeight / H);
        return {
            left: Math.round(cssX(minX)), right: Math.round(cssX(maxX)),
            top: Math.round(cssY(maxY)), bottom: Math.round(cssY(minY)),
            cx: Math.round(cssX((minX + maxX) / 2)),
            cy: Math.round(cssY((minY + maxY) / 2)),
            pixels: hits,
        };
    });
}

async function run(context, orientation) {
    const page = await context.newPage();
    await page.setViewportSize(orientation.viewport);
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await boot(page);

    const hint = await rotateHint(page);
    const { width: W, height: H } = orientation.viewport;
    const results = [];

    // 1. The title screen takes any press. If a finger cannot get past it,
    //    nothing else on this device matters.
    results.push(await tap(page, W / 2, H / 2, 'title screen (any press)'));
    await shot(page, `${orientation.name}-01-login`);

    // 2. The primary button, wherever it is drawn. On the login screen with no
    //    profiles that is "New player".
    const rect = await primaryButtonRect(page);
    if (rect) {
        results.push(await press(page, rect.cx, rect.cy, 'primary button', 'touch'));
        await shot(page, `${orientation.name}-02-after-finger`);
    }
    console.log(`\n── ${orientation.name} ${W}x${H}`);
    if (hint.present) {
        console.log(`   rotate hint : ${hint.showing ? 'SHOWING and covering the page' : 'hidden'}`);
    }
    console.log(rect
        ? `   primary btn : drawn at x ${rect.left}..${rect.right}, y ${rect.top}..${rect.bottom} (${rect.pixels} px)`
        : '   primary btn : NOT FOUND on screen');
    for (const r of results) {
        console.log(`   ${r.landed ? 'tap landed ' : 'TAP IGNORED'}  ${r.label.padEnd(24)} at (${r.x},${r.y})  ${r.cells}/64 cells changed`);
    }
    await page.close();

    // THE CONTROL, and the actual hypothesis. "The touch zone is not correct"
    // means a finger and a mouse disagree about where a button is. A finger-only
    // result cannot show that, because a tap that misses looks exactly like a
    // button that is dead. So the same point is pressed again on a fresh boot
    // with the mouse: if the mouse lands where the finger did not, the touch path
    // is wrong; if neither lands, the button is.
    let mouse = null;
    if (rect) {
        const control = await context.newPage();
        await control.setViewportSize(orientation.viewport);
        await boot(control);
        await press(control, W / 2, H / 2, 'title screen', 'mouse');
        mouse = await press(control, rect.cx, rect.cy, 'primary button', 'mouse');
        await shot(control, `${orientation.name}-03-after-mouse`);
        await control.close();
    }

    console.log(`   console errors: ${errors.length}`);
    for (const e of errors.slice(0, 3)) console.log(`     ERR ${e}`);
    if (mouse) {
        console.log(`   ${mouse.landed ? 'MOUSE landed' : 'mouse ignored'}  same point, mouse instead of finger  ${mouse.cells}/64 cells changed`);
    }
    return { orientation: orientation.name, hint, rect, results, mouse, errors };
}

async function main() {
    if (!readdirSync(WEB_DIR).some(f => /^index\.[0-9a-f]+\.wasm$/.test(f))) {
        console.error(`FAIL: no export at ${WEB_DIR}. Run: bash godot/tools/build_web.sh`);
        process.exit(1);
    }
    await mkdir(SHOT_DIR, { recursive: true });
    const server = serve();
    let browser;
    try {
        await new Promise(r => setTimeout(r, 700));
        browser = await chromium.launch({ executablePath: CHROMIUM });
        const context = await browser.newContext({ viewport: ORIENTATIONS[0].viewport, hasTouch: true, isMobile: true });
        const all = [];
        for (const o of ORIENTATIONS) all.push(await run(context, o));

        console.log('');
        let bad = 0;
        for (const r of all) {
            if (!r.rect) { bad += 1; console.log(`FAIL [${r.orientation}] no primary button was drawn at all`); }
            for (const t of r.results) {
                if (!t.landed) { bad += 1; console.log(`FAIL [${r.orientation}] ${t.label} did not respond to a finger`); }
            }
            const finger = r.results.find(t => t.label === 'primary button');
            if (finger && r.mouse) {
                if (!finger.landed && r.mouse.landed) {
                    console.log(`FAIL [${r.orientation}] the touch zone is WRONG: a mouse works where a finger does not`);
                } else if (!finger.landed && !r.mouse.landed) {
                    console.log(`NOTE [${r.orientation}] neither finger nor mouse landed - the button, not the touch path`);
                }
            }
            if (r.errors.length) { bad += 1; console.log(`FAIL [${r.orientation}] ${r.errors.length} console error(s)`); }
        }
        console.log(bad === 0
            ? 'touch: every tap landed on the button as drawn, both orientations'
            : `touch: ${bad} problem(s)`);
        console.log(`shots: ${SHOT_DIR}`);
        if (bad) process.exitCode = 2;
    } finally {
        if (browser) await browser.close();
        server.kill();
    }
}

main();
