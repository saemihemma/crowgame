/**
 * Web-export boot smoke for the Godot build.
 *
 * What this is: proof that the *exported* output/web build actually boots in a
 * real browser — engine start, pck load, first scene up, no console errors —
 * emulating an iPad viewport and touch input. This is what catches an export
 * config mistake (a wrongly excluded asset, a broken shell) that the headless
 * GDScript suite cannot see, because that suite runs from source, not the pck.
 *
 * What this is NOT: not proof the game plays correctly on real iPad Safari.
 * It is Chromium with an iPad viewport and touch emulation. WebKit-specific
 * behaviour (audio-context unlock rules, memory ceilings, Safari's WASM
 * compilation limits) still needs a device check.
 *
 * Usage: node godot/tools/web_boot_smoke.mjs [--port 8061]
 */
import { existsSync, readdirSync } from 'fs';
import { spawn } from 'child_process';
import { mkdir, writeFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const WEB_DIR = resolve(ROOT, 'output/web');
const PORT = Number(process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : 8061);

const EXECUTABLE_CANDIDATES = [
    process.env.CHROMIUM_PATH,
    '/opt/pw-browsers/chromium',
    '/opt/pw-browsers/chromium-1091/chrome-linux/chrome',
].filter(Boolean);

function resolveChromium() {
    const found = EXECUTABLE_CANDIDATES.find(existsSync);
    if (found) return found;
    // Fall back to whatever playwright-core resolves on this machine.
    return undefined;
}

// iPad (10th gen) CSS viewport in landscape — the owner's primary device class.
const IPAD = { width: 1180, height: 820 };

async function main() {
    // The payload is content-addressed (index.<id>.wasm), so this looks for the
    // pattern rather than a fixed name.
    if (!readdirSync(WEB_DIR).some(f => /^index\.[0-9a-f]+\.wasm$/.test(f))) {
        console.error(`FAIL: no export found at ${WEB_DIR}. Run: bash godot/tools/build_web.sh`);
        process.exit(1);
    }

    // Serve the export, and answer /api/* the way production does.
    //
    // In a real deploy Caddy always proxies /api/* to the API service, so the
    // client's session probe gets a JSON answer. A bare static server would 404
    // it, the browser would log that 404 as a console error, and this smoke would
    // fail for a reason that does not exist in production. Stubbing the one
    // endpoint the boot path touches models the real edge.
    const server = spawn(process.execPath, ['-e', `
        const http = require('http'), fs = require('fs'), path = require('path');
        const MIME = { '.html':'text/html', '.js':'text/javascript', '.wasm':'application/wasm',
            '.pck':'application/octet-stream', '.png':'image/png', '.json':'application/json',
            '.svg':'image/svg+xml', '.wav':'audio/wav', '.mp3':'audio/mpeg' };
        http.createServer((req, res) => {
            if (req.url.startsWith('/api/v1/auth/session')) {
                res.writeHead(200, {'content-type':'application/json'});
                return res.end('{"enrolled":false}');
            }
            if (req.url.startsWith('/api/')) {
                res.writeHead(200, {'content-type':'application/json'});
                return res.end('{}');
            }
            const p = path.join(${JSON.stringify(WEB_DIR)}, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
            fs.readFile(p, (err, body) => {
                if (err) { res.writeHead(404).end('not found'); return; }
                res.writeHead(200, {'content-type': MIME[path.extname(p)] || 'application/octet-stream'});
                res.end(body);
            });
        }).listen(${PORT}, '127.0.0.1');
    `], { stdio: 'ignore' });
    const consoleErrors = [];
    const failedRequests = [];
    let browser;
    try {
        await new Promise(r => setTimeout(r, 700));
        browser = await chromium.launch({ executablePath: resolveChromium() });
        const context = await browser.newContext({ viewport: IPAD, hasTouch: true, isMobile: false });
        const page = await context.newPage();
        page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
        page.on('requestfailed', r => failedRequests.push(`${r.url()} ${r.failure()?.errorText ?? ''}`));

        await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 120_000 });

        // The engine reports readiness by sizing the canvas to the viewport.
        await page.waitForFunction(() => {
            const c = document.querySelector('canvas');
            return c && c.width > 0 && c.height > 0;
        }, { timeout: 180_000 });

        // Let the boot scene settle and the first real scene come up.
        await page.waitForTimeout(9000);

        const canvas = await page.evaluate(() => {
            const c = document.querySelector('canvas');
            return { width: c.width, height: c.height, clientWidth: c.clientWidth, clientHeight: c.clientHeight };
        });

        // A blank canvas would mean "booted but rendered nothing" — check that
        // the frame actually has more than one colour in it.
        const shot = resolve(ROOT, 'output/playwright/web-boot-smoke/ipad-boot.png');
        await mkdir(dirname(shot), { recursive: true });
        await page.screenshot({ path: shot });

        // Sample the WHOLE canvas, not a fixed box inside it.
        //
        // This used to read a centre 240x240 region, on the reasoning that a corner
        // is legitimately one flat colour (sky) and so useless as a "did anything
        // render" signal. But the centre is just as legitimately flat: the login
        // screen puts its title and buttons in the upper third, so the centre of
        // the frame is empty sky and the check reported 1 colour on a build that
        // was rendering perfectly. A layout change should not be able to fail the
        // boot gate. Reading the full frame is both layout-independent and a
        // strictly stronger signal.
        const render = await page.evaluate(() => {
            const c = document.querySelector('canvas');
            const g = c.getContext('webgl2') || c.getContext('webgl');
            if (!g) return { distinctColors: -1 };
            const px = new Uint8Array(4 * c.width * c.height);
            g.readPixels(0, 0, c.width, c.height, g.RGBA, g.UNSIGNED_BYTE, px);
            const seen = new Set();
            for (let i = 0; i < px.length; i += 4) seen.add(`${px[i]},${px[i+1]},${px[i+2]}`);
            return { distinctColors: seen.size };
        });
        const distinctColors = render.distinctColors;

        // How much of an iPad screen the game actually uses — gate B1.
        //
        // This used to compute the bars from a HARDCODED 16:9, which made it a
        // false negative the moment the stretch policy changed. Under
        // `stretch/aspect=expand` the viewport IS the window, so the canvas
        // fills it and there are no bars — but the old maths reported a phantom
        // 156px / 19.1% anyway, which is the exact figure the switch to `expand`
        // was made to eliminate. Its own comment claimed a policy change would
        // "show up as a number"; hardcoding the aspect is what stopped that
        // being true.
        //
        // So measure what is actually on screen: the canvas box against the
        // viewport, in both axes.
        const letterbox = await page.evaluate(() => {
            const c = document.querySelector('canvas');
            const r = c.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const barsH = Math.max(0, Math.round(vh - r.height));
            const barsW = Math.max(0, Math.round(vw - r.width));
            const usedPct = Math.round(((r.width * r.height) / (vw * vh)) * 1000) / 10;
            return {
                cssViewport: `${Math.round(vw)}x${Math.round(vh)}`,
                canvasBox: `${Math.round(r.width)}x${Math.round(r.height)}`,
                barsTotalPx: barsH + barsW,
                verticalBarsPx: barsH,
                horizontalBarsPx: barsW,
                screenUsedPct: usedPct,
            };
        });

        const result = {
            accepted: consoleErrors.length === 0 && failedRequests.length === 0 && canvas.width > 0 && distinctColors > 1,
            kind: 'web_export_boot_smoke',
            whatThisIs: 'Exported output/web build booted in Chromium at an iPad landscape viewport with touch enabled.',
            whatThisIsNot: 'Not real iPad Safari verification. WebKit audio unlock, memory ceilings and WASM limits are unproven here.',
            viewport: IPAD,
            canvas,
            distinctCanvasColors: distinctColors,
            letterbox,
            consoleErrors,
            failedRequests,
            screenshot: 'output/playwright/web-boot-smoke/ipad-boot.png',
        };
        const out = resolve(ROOT, 'reports/web/boot-smoke.json');
        await mkdir(dirname(out), { recursive: true });
        await writeFile(out, JSON.stringify(result, null, 2) + '\n');

        console.log(`canvas          : ${canvas.width}x${canvas.height} (css ${canvas.clientWidth}x${canvas.clientHeight})`);
        console.log(`distinct colors : ${distinctColors} (full canvas)`);
        console.log(`ipad letterbox  : ${letterbox.barsTotalPx}px bars (${letterbox.verticalBarsPx}v/${letterbox.horizontalBarsPx}h), canvas covers ${letterbox.screenUsedPct}% of the viewport`);
        console.log(`console errors  : ${consoleErrors.length}`);
        console.log(`failed requests : ${failedRequests.length}`);
        for (const e of consoleErrors.slice(0, 5)) console.log(`  ERR ${e}`);
        for (const f of failedRequests.slice(0, 5)) console.log(`  REQ ${f}`);
        console.log(result.accepted ? 'PASS: exported build boots' : 'FAIL: exported build did not boot cleanly');
        process.exitCode = result.accepted ? 0 : 1;
    } finally {
        if (browser) await browser.close();
        server.kill('SIGTERM');
    }
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
