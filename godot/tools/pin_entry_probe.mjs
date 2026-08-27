/**
 * Does typing a PIN show the child anything?
 *
 * The report: "when im choosing a pin in acct creation it doesnt fill out the
 * dots of the pin as i type out". login.gd draws four dots and fills them from
 * LineEdit.text_changed, which works when keys reach the canvas -- so the
 * suspicion is the OTHER input path, the one an iPad uses and a laptop never
 * does: with html/experimental_virtual_keyboard on, Godot injects a real DOM
 * <input> beside the canvas and a touch device types into THAT. If the text
 * arriving that way does not raise text_changed, the dots never move and the
 * child gets no sign their tap registered.
 *
 * So this drives both paths and photographs each keystroke:
 *   canvas  -- keys straight at the canvas, what a laptop does
 *   vk      -- typed into Godot's injected <input> with real DOM input events,
 *              what an iPad does
 *
 * Run: node godot/tools/pin_entry_probe.mjs [--port 8073] [--shots <dir>]
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
const PORT = Number(argv.includes('--port') ? argv[argv.indexOf('--port') + 1] : 8073);
const SHOT_DIR = argv.includes('--shots')
    ? resolve(argv[argv.indexOf('--shots') + 1])
    : resolve(ROOT, 'output/pin-probe');

const IPAD = { width: 1180, height: 820 };
const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH].find(p => p && existsSync(p));

const NEW_PLAYER = { x: 590, y: 486 };
const NAME_FIELD = { x: 590, y: 200 };
const PIN_FIELD = { x: 590, y: 330 };

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

/**
 * How many of the four PIN dots are FILLED, read off the frame.
 *
 * A filled dot is a solid disc of ink; an empty one is a ring of the same ink
 * around the paper of the field. So both have ink pixels and counting ink is
 * useless -- what separates them is ink DENSITY inside the dot. This samples the
 * band the dots sit in and counts columns whose centre row is inked, which a
 * ring's hollow middle is not.
 */
/**
 * Did the screen change when a key was pressed?
 *
 * THREE DETECTORS DIED BEFORE THIS ONE, and the pattern is worth keeping. The
 * first read a six-pixel band at a y passed in from outside; adding the
 * confirmation field moved the row, the band landed on blank paper, and the
 * probe called the dots dead in the same run whose screenshot showed them
 * filling perfectly. The second scanned every row for runs of dark pixels and
 * took the best, and found four runs across the top arcs of four EMPTY rings --
 * a full PIN before a key was pressed. The third counted dark pixels in a band,
 * where one filled dot moves the number by less than the numeral that briefly
 * appears on top of it, so the series wobbled instead of rising.
 *
 * Each of those tried to measure the DOTS. The complaint is not about dots, it
 * is "it doesnt fill out the dots as i type" -- that the screen says nothing
 * back. So measure that: quantise the form area into cells and ask whether any
 * of them changed. A filled dot changes cells; nothing changing is exactly the
 * bug.
 *
 * The band stops at 55% of the canvas because the Create button below it PULSES,
 * and a detector that watches an animation reports success no matter what.
 */
async function formCells(page) {
    return page.evaluate(() => {
        const c = document.querySelector('canvas');
        const g = c.getContext('webgl2') || c.getContext('webgl');
        if (!g) return 'nogl';
        const w = Math.min(c.width, 560);
        const x = Math.floor((c.width - w) / 2);
        // GL is bottom-left origin, so the TOP 55% of the screen is the high y.
        const h = Math.floor(c.height * 0.55);
        const y = c.height - h;
        const px = new Uint8Array(4 * w * h);
        g.readPixels(x, y, w, h, g.RGBA, g.UNSIGNED_BYTE, px);
        const CX = 24, CY = 24, out = [];
        for (let cy = 0; cy < CY; cy += 1) {
            for (let cx = 0; cx < CX; cx += 1) {
                let sum = 0, n = 0;
                for (let yy = Math.floor(cy * h / CY); yy < Math.floor((cy + 1) * h / CY); yy += 2) {
                    for (let xx = Math.floor(cx * w / CX); xx < Math.floor((cx + 1) * w / CX); xx += 2) {
                        const o = (yy * w + xx) * 4;
                        sum += (px[o] + px[o + 1] + px[o + 2]) / 3;
                        n += 1;
                    }
                }
                out.push(Math.round(sum / Math.max(1, n) / 8));
            }
        }
        return out.join(',');
    });
}

function changedCells(a, b) {
    if (a === b) return 0;
    const A = a.split(','), B = b.split(',');
    let n = 0;
    for (let i = 0; i < A.length; i += 1) if (A[i] !== B[i]) n += 1;
    return n;
}

/** Godot's injected virtual-keyboard input, if it is showing. */
async function vkField(page) {
    return page.evaluate(() => {
        const inputs = [...document.querySelectorAll('input, textarea')];
        const shown = inputs.filter(i => getComputedStyle(i).display !== 'none');
        return {
            total: inputs.length,
            showing: shown.length,
            value: shown.length ? shown[0].value : null,
            focused: shown.length ? document.activeElement === shown[0] : false,
        };
    });
}

const shot = (page, name) => page.screenshot({ path: resolve(SHOT_DIR, `${name}.png`) });

async function openNewPlayer(page) {
    await page.mouse.click(NEW_PLAYER.x, NEW_PLAYER.y);
    await wait(page, 1500);
    await page.mouse.click(NAME_FIELD.x, NAME_FIELD.y);
    await wait(page, 400);
    await page.keyboard.type('Probe', { delay: 60 });
    await wait(page, 400);
}

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
        const context = await browser.newContext({ viewport: IPAD, hasTouch: true });
        const page = await context.newPage();
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

        await boot(page);
        await openNewPlayer(page);
        await shot(page, '01-new-player-form');

        // ── Path 1: keys at the canvas. What a laptop does, and what every
        // harness before this one exercised.
        await page.mouse.click(PIN_FIELD.x, PIN_FIELD.y);
        await wait(page, 600);
        const canvasRun = [];
        let prev = await formCells(page);
        for (const digit of ['1', '2', '3', '4']) {
            await page.keyboard.type(digit, { delay: 40 });
            await wait(page, 500);
            const now = await formCells(page);
            canvasRun.push(changedCells(prev, now));
            prev = now;
        }
        // NEGATIVE CONTROL, in the probe rather than in my head: the field holds
        // four digits, so a fifth keystroke must change nothing. If it does, this
        // detector is watching something that moves on its own and every result
        // above is worthless.
        //
        // After the reveal window, not during it. The newest digit shows itself
        // for login/pin_reveal_ms and then becomes a dot, which is a change the
        // screen makes on its own -- the first version of this control pressed
        // the fifth key inside that window and blamed the keystroke for it.
        await wait(page, 1600);
        prev = await formCells(page);
        await page.keyboard.type('5', { delay: 40 });
        await wait(page, 500);
        const afterFifth = changedCells(prev, await formCells(page));
        await shot(page, '02-after-canvas-typing');
        console.log(`canvas keys : cells changed per digit -> ${canvasRun.join(', ')}`);
        console.log(`             a 5th key into a full field changed ${afterFifth} cells (must be 0)`);

        // ── Path 2: Godot's own virtual-keyboard <input>. What an iPad does.
        // Cleared first, through the same field, so both runs start from empty.
        for (let i = 0; i < 6; i += 1) await page.keyboard.press('Backspace');
        await wait(page, 600);

        const vk = await vkField(page);
        console.log(`vk field    : ${vk.showing} of ${vk.total} input(s) showing, focused=${vk.focused}`);
        let vkRun = [];
        if (vk.showing > 0) {
            let vprev = await formCells(page);
            for (const digit of ['1', '2', '3', '4']) {
                // A real input event, the way a soft keyboard delivers one.
                await page.evaluate((d) => {
                    const el = [...document.querySelectorAll('input, textarea')]
                        .find(i => getComputedStyle(i).display !== 'none');
                    el.focus();
                    el.value = el.value + d;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                }, digit);
                await wait(page, 500);
                const now = await formCells(page);
                vkRun.push(changedCells(vprev, now));
                vprev = now;
            }
            await shot(page, '03-after-vk-typing');
            console.log(`vk typing   : cells changed per digit -> ${vkRun.join(', ')}`);
        } else {
            console.log('vk typing   : SKIPPED - no virtual-keyboard input was showing');
        }

        console.log(`console errors: ${errors.length}`);
        for (const e of errors.slice(0, 5)) console.log(`  ERR ${e}`);
        console.log(`shots       : ${SHOT_DIR}`);
        console.log('');
        const canvasOk = canvasRun.length === 4 && canvasRun.every(n => n > 0) && afterFifth === 0;
        const vkOk = vk.showing === 0 ? null : (vkRun.length === 4 && vkRun.every(n => n > 0));
        console.log(`canvas path : ${canvasOk ? 'the field answered every keystroke' : 'BROKEN (' + canvasRun.join(',') + ')'}`);
        console.log(`vk path     : ${vkOk === null ? 'not exercised' : vkOk ? 'the field answered every keystroke' : 'BROKEN (' + vkRun.join(',') + ')'}`);
        if (!canvasOk || vkOk === false) process.exitCode = 2;
    } finally {
        if (browser) await browser.close();
        server.kill();
    }
}

main();
