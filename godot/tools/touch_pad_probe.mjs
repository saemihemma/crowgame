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

        // A pad answers by turning its own square bright coin. Sampled inside that
        // pad's own footprint, so nothing else on screen can move the number --
        // and the pad lighting is the right signal because TouchScreenButton only
        // highlights when the press landed inside its shape.
        const lit = (name, box) => page.evaluate(({ box, W, H }) => {
            const c = document.querySelector('canvas');
            const g = c.getContext('webgl2') || c.getContext('webgl');
            const sx = Math.round(box.x0 * c.width / W), ex = Math.round(box.x1 * c.width / W);
            const sy = Math.round(box.y0 * c.height / H), ey = Math.round(box.y1 * c.height / H);
            const w = ex - sx, h = ey - sy;
            const px = new Uint8Array(4 * w * h);
            g.readPixels(sx, c.height - ey, w, h, g.RGBA, g.UNSIGNED_BYTE, px);
            let coin = 0, n = 0;
            for (let i = 0; i < px.length; i += 4) {
                n += 1;
                if (px[i] >= 240 && px[i + 1] >= 170 && px[i + 1] <= 230 && px[i + 2] <= 120) coin += 1;
            }
            return coin / n;
        }, { box, W, H });

        const plate = (centre, size) => ({
            x0: centre.x - size * scale / 2, x1: centre.x + size * scale / 2,
            y0: centre.y - size * scale / 2, y1: centre.y + size * scale / 2,
        });

        const results = [];
        for (const [name, pt] of pads) {
            const box = plate(pt, name === 'jump' ? JUMP : BTN);
            const before = await lit(name, box);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y, id: 1 }] });
            await wait(page, 320);
            const during = await lit(name, box);
            await page.screenshot({ path: resolve(SHOT_DIR, `pad-${name}.png`) });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            await wait(page, 800);
            const answered = during - before > 0.25;
            results.push({ name, pt, answered });
            console.log(`  ${answered ? 'answers  ' : 'IGNORES  '} ${name.padEnd(11)} pressed at its drawn centre (${pt.x},${pt.y})`);
        }

        // And the pair the report is about: forward held, jump landing second.
        const right = pads[1], jump = pads[4];
        const jumpBox = plate(jump[1], JUMP);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...right[1], id: 1 }] });
        await wait(page, 400);
        const beforePair = await lit('jump', jumpBox);
        await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [{ ...right[1], id: 1 }, { ...jump[1], id: 2 }],
        });
        await wait(page, 320);
        const duringPair = await lit('jump', jumpBox);
        await page.screenshot({ path: resolve(SHOT_DIR, 'pad-forward-and-jump.png') });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await wait(page, 500);
        const pairOk = duringPair - beforePair > 0.25;
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
