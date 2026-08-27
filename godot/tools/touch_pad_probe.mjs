/**
 * Does each on-screen pad answer a finger where the pad is DRAWN?
 *
 * This exists because the answer is currently no, and nothing else in the repo
 * could see it. The headless suite checks the pads' geometry and passes; it
 * cannot check the hit test, because TouchScreenButton does its own
 * screen-to-canvas hit testing and a headless tree has no canvas for it (see
 * test_touch_controls.gd). So the only place this is measurable is a real browser
 * with real touch events, which is here.
 *
 * WHAT IT FOUND. Pressing the jump pad at its exact drawn centre does nothing --
 * the pad does not light and the crow does not jump. Pressing up and to the LEFT
 * of the plate, off the drawn button entirely, lights it and jumps. The pressable
 * square is displaced from the plate, by roughly half the pad's size, which is
 * why the biggest pad (jump, 112 units against the others' 92) is the one that
 * feels dead: for the 92s the drawn centre still just catches the corner of the
 * displaced rectangle, so they answer sometimes.
 *
 * That is the whole of the owner's report: "difficult to press two buttons at the
 * same time (forward and jump)" -- jump barely answers alone -- and "the box for
 * the button seems very small", which is true of the responsive area and false of
 * the drawn one. Measured drawn sizes are 21.8mm and 26.5mm on an 11-inch iPad,
 * 2.6x and 3.2x Apple's 44pt minimum. Nothing needs to be bigger.
 *
 * Two things were ruled out on the way, both worth not re-testing:
 *   - The browser DOES deliver simultaneous touches to the canvas. Verified by
 *     listening on the canvas element itself: changed=[2@1071,712] active=[1,2].
 *     So this is not a multitouch-delivery problem.
 *   - input_devices/pointing/emulate_mouse_from_touch=false changes nothing.
 *
 * Still open: the mechanism. shape_centered=true was tried and did NOT fix the
 * offset, so the obvious reading of that flag is not the explanation.
 *
 * Run: node godot/tools/touch_pad_probe.mjs [--port 8075] [--shots <dir>]
 */
// Ground truth on one question: do TWO pads register at once?
// No detectors. Two fingers down, screenshots, and I look at them.
import { existsSync, readdirSync } from 'fs';
import { spawn } from 'child_process';
import { mkdir } from 'fs/promises';
import { resolve } from 'path';
import { chromium } from 'playwright-core';
import { inflateSync as zlibInflate } from 'zlib';

const ROOT = '/home/user/crowgame';
const WEB_DIR = resolve(ROOT, 'output/web');
const argvPort = process.argv.includes('--port') ? Number(process.argv[process.argv.indexOf('--port') + 1]) : 8075;
const PORT = argvPort;
const SHOT_DIR = process.argv.includes('--shots')
    ? resolve(process.argv[process.argv.indexOf('--shots') + 1])
    : resolve(ROOT, 'output/pad-probe');
const IPAD = { width: 1180, height: 820 };
const CHROMIUM = '/opt/pw-browsers/chromium';

function serve() {
    return spawn(process.execPath, ['-e', `
        const http=require('http'),fs=require('fs'),path=require('path');
        const MIME={'.html':'text/html','.js':'text/javascript','.wasm':'application/wasm',
            '.pck':'application/octet-stream','.png':'image/png','.json':'application/json',
            '.svg':'image/svg+xml','.wav':'audio/wav','.mp3':'audio/mpeg'};
        http.createServer((req,res)=>{
            if(req.url.startsWith('/api/')){res.writeHead(200,{'content-type':'application/json'});return res.end('{}');}
            const p=path.join(${JSON.stringify(WEB_DIR)},req.url==='/'?'index.html':decodeURIComponent(req.url.split('?')[0]));
            fs.readFile(p,(e,b)=>{ if(e){res.writeHead(404).end('nope');return;}
                res.writeHead(200,{'content-type':MIME[path.extname(p)]||'application/octet-stream'});res.end(b);});
        }).listen(${PORT},'127.0.0.1');
    `], { stdio: 'ignore' });
}
const wait = (p, ms) => p.waitForTimeout(ms);

async function boot(page) {
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction(() => { const c = document.querySelector('canvas'); return c && c.width > 0; }, { timeout: 240000 });
    await wait(page, 9000);
    await page.keyboard.press('Enter');
    await wait(page, 2500);
}


/**
 * Just enough PNG to read a screenshot's pixels: 8-bit RGB or RGBA, no
 * interlacing, which is what Playwright emits. Written out rather than pulled in
 * because this repo has no image dependency and one function is cheaper than one.
 */
function decodePng(buf) {
    let i = 8, width = 0, height = 0, colourType = 6;
    const idat = [];
    while (i < buf.length) {
        const len = buf.readUInt32BE(i);
        const type = buf.toString('ascii', i + 4, i + 8);
        const data = buf.subarray(i + 8, i + 8 + len);
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            colourType = data[9];
        } else if (type === 'IDAT') {
            idat.push(data);
        } else if (type === 'IEND') break;
        i += 12 + len;
    }
    const raw = zlibInflate(Buffer.concat(idat));
    const channels = colourType === 6 ? 4 : 3;
    const stride = width * channels;
    const out = Buffer.alloc(width * height * 3);
    let prev = Buffer.alloc(stride);
    let pos = 0;
    for (let y = 0; y < height; y += 1) {
        const filter = raw[pos]; pos += 1;
        const line = Buffer.from(raw.subarray(pos, pos + stride)); pos += stride;
        for (let x = 0; x < stride; x += 1) {
            const a = x >= channels ? line[x - channels] : 0;
            const b = prev[x];
            const c = x >= channels ? prev[x - channels] : 0;
            if (filter === 1) line[x] = (line[x] + a) & 255;
            else if (filter === 2) line[x] = (line[x] + b) & 255;
            else if (filter === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
            else if (filter === 4) {
                const p = a + b - c;
                const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
                line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
            }
        }
        for (let x = 0; x < width; x += 1) {
            out[(y * width + x) * 3] = line[x * channels];
            out[(y * width + x) * 3 + 1] = line[x * channels + 1];
            out[(y * width + x) * 3 + 2] = line[x * channels + 2];
        }
        prev = line;
    }
    return { width, height, rgb: out };
}

async function main() {
    await mkdir(SHOT_DIR, { recursive: true });
    const server = serve();
    let browser;
    try {
        await new Promise(r => setTimeout(r, 700));
        browser = await chromium.launch({ executablePath: CHROMIUM });
        const ctx = await browser.newContext({ viewport: IPAD, hasTouch: true, isMobile: true });
        const page = await ctx.newPage();
        await boot(page);
        // New player -> name -> pin -> pin again -> create
        await page.mouse.click(590, 486); await wait(page, 1500);
        for (const [y, t] of [[176, 'MT'], [307, '1234'], [443, '1234']]) {
            await page.mouse.click(590, y); await wait(page, 400);
            await page.keyboard.type(t, { delay: 60 }); await wait(page, 300);
        }
        await page.mouse.click(590, 721); await wait(page, 3500);
        // main menu -> PLAY -> first level
        await page.keyboard.press('Enter'); await wait(page, 1800);
        await page.keyboard.press('Enter'); await wait(page, 4500);
        await page.screenshot({ path: resolve(SHOT_DIR, '1-level.png') });

        const cdp = await ctx.newCDPSession(page);

        // Each pad's DRAWN centre, computed the way touch_controls.gd lays them
        // out for this exact viewport. Checked against the frame: the left
        // arrow's centre comes out at (96,724), which is where it is drawn.
        const W = IPAD.width, H = IPAD.height;
        const scale = Math.min(W / 960, H / 540);
        const vh = H / scale, MARGIN = 32, GAP = 14, BTN = 92, JUMP = 112;
        const floorY = vh - MARGIN, rowY = floorY - BTN;
        const css = (x, y) => ({ x: Math.round(x * scale), y: Math.round(y * scale) });
        const jumpX = 960 - MARGIN - JUMP;
        const sprintX = jumpX - GAP - BTN;
        const pads = [
            ['move_left', css(MARGIN + BTN / 2, rowY + BTN / 2)],
            ['move_right', css(MARGIN + BTN + GAP + BTN / 2, rowY + BTN / 2)],
            ['shoot', css(sprintX - GAP - BTN + BTN / 2, rowY + BTN / 2)],
            ['sprint', css(sprintX + BTN / 2, rowY + BTN / 2)],
            ['jump', css(jumpX + JUMP / 2, floorY - JUMP + JUMP / 2)],
        ];

        // A pad answers by turning its own square bright coin, and that is read
        // off a SCREENSHOT rather than out of WebGL.
        //
        // WHY NOT readPixels, WHICH EVERY EARLIER VERSION OF THIS USED. Godot's
        // canvas is created without preserveDrawingBuffer, so the colour buffer is
        // undefined once the frame has been composited -- a read from outside a
        // frame callback returns the current frame sometimes and a cleared buffer
        // other times. That is not a subtle bias, it is a coin flip, and it is why
        // this probe kept reporting pads as ignored whose own screenshot from the
        // same press showed them lit. Every detector in this file's history died
        // of it. A screenshot is a real composite and cannot lie that way.
        // ONE screenshot per press, sampled for the pad's own square.
        //
        // Not a separate clipped screenshot: a clip and a full frame are two
        // captures at two instants, and the sprint pad read as ignored in its clip
        // while the full frame from the same press showed it plainly lit. Sampling
        // the frame that gets saved means the tool and a human looking at the
        // saved file cannot disagree about what happened.
        const litInShot = (shot, box) => {
            const { width, height, rgb } = decodePng(shot);
            const sx = Math.max(0, Math.round(box.x0 * width / IPAD.width));
            const ex = Math.min(width, Math.round(box.x1 * width / IPAD.width));
            const sy = Math.max(0, Math.round(box.y0 * height / IPAD.height));
            const ey = Math.min(height, Math.round(box.y1 * height / IPAD.height));
            let coin = 0, n = 0;
            for (let y = sy; y < ey; y += 1) {
                for (let x = sx; x < ex; x += 1) {
                    const o = (y * width + x) * 3;
                    n += 1;
                    const r = rgb[o], g = rgb[o + 1], b = rgb[o + 2];
                    // r>=215, not 240. The plate is 92% opaque, so 8% of whatever
                    // the level is drawing behind it bleeds through: a lit pad over
                    // bright ground measures (240,176,48) and the same lit pad over
                    // darker ground measures (224,176,48). A 240 cutoff called the
                    // sprint pad unlit while its own saved screenshot showed it
                    // plainly amber. An unlit plate is dark ink and nowhere near
                    // this, so the wider band costs nothing.
                    if (r >= 215 && g >= 160 && g <= 235 && b <= 130) coin += 1;
                }
            }
            return coin / Math.max(1, n);
        };

        const plate = (centre, size) => ({
            x0: centre.x - size * scale / 2, x1: centre.x + size * scale / 2,
            y0: centre.y - size * scale / 2, y1: centre.y + size * scale / 2,
        });

        // A FRESH TOUCH ID PER PRESS. Reusing id 1 made every second press appear
        // to be ignored -- an alternating pass/fail pattern that is a state
        // artefact, not geometry: a browser and an engine both track a touch by
        // its identifier, and a new press carrying an identifier they still
        // believe is down is not a new press.
        let touchId = 0;
        const results = [];
        for (const [name, pt] of pads) {
            touchId += 1;
            const box = plate(pt, name === 'jump' ? JUMP : BTN);
            // ABSOLUTE, not a difference. The delta version reported pads as
            // ignored whose own screenshot from the same press showed them lit --
            // a before/after reading races the press-grow animation and the scene
            // moving behind a translucent plate. A lit plate is most of a square
            // of coin and an unlit one has essentially none, so the reading needs
            // no baseline at all.
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y, id: touchId }] });
            await wait(page, 320);
            const shot = await page.screenshot({ path: resolve(SHOT_DIR, `pad-${name}.png`) });
            const during = litInShot(shot, box);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            await wait(page, 800);
            // 0.30, from the measured range: an unlit plate reads essentially
            // zero coin and a lit one 0.4 to 0.8 depending on how much of it the
            // icon covers. 0.45 clipped the sprint pad, whose chevrons-and-speed-
            // lines icon eats more of the square than a solid arrow does.
            const answered = during > 0.30;
            results.push({ name, pt, answered });
            console.log(`  ${answered ? 'answers  ' : 'IGNORES  '} ${name.padEnd(11)} pressed at its drawn centre (${pt.x},${pt.y})`);
        }

        // And the pair the report is about: forward held, jump landing second.
        const right = pads[1], jump = pads[4];
        const jumpBox = plate(jump[1], JUMP);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...right[1], id: 101 }] });
        await wait(page, 400);
        await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [{ ...right[1], id: 101 }, { ...jump[1], id: 102 }],
        });
        await wait(page, 320);
        const pairShot = await page.screenshot({ path: resolve(SHOT_DIR, 'pad-forward-and-jump.png') });
        const duringPair = litInShot(pairShot, jumpBox);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await wait(page, 500);
        const pairOk = duringPair > 0.30;
        console.log(`  ${pairOk ? 'answers  ' : 'IGNORES  '} jump while forward is held`);

        const dead = results.filter(r => !r.answered).map(r => r.name);
        console.log('');
        if (dead.length === 0 && pairOk) {
            console.log('touch pads: every pad answers a finger at the point it is drawn.');
        } else {
            if (dead.length) console.log(`FAIL: ${dead.join(', ')} did not answer a press at the drawn centre.`);
            if (!pairOk) console.log('FAIL: jump did not answer while forward was held.');
            console.log('The pressable area is not where the pad is drawn. See the header.');
            process.exitCode = 2;
        }
        await cdp.detach();
        console.log(`shots: ${SHOT_DIR}`);
    } finally {
        if (browser) await browser.close();
        server.kill();
    }
}
main();
