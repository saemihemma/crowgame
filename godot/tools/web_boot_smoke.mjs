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
 * Usage: node godot/tools/web_boot_smoke.mjs [--port 8061] [--shots <dir>]
 *
 * `--shots <dir>` also writes a PNG of every step of the walk. That is not part
 * of the gate — a screenshot cannot fail a build — but "what does each screen
 * actually look like right now, at a size nobody plays on" is the question that
 * found the UI being cut off on every 16:9 display, and it is worth being one
 * flag away rather than a script somebody writes again each time. The gate for
 * that defect is godot/tests/test_screen_fit.gd, which is deterministic and
 * headless; this is the human's version of it.
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
const SHOT_DIR = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;

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

/** A blank or near-blank frame is not a render. A working build measures ~2714. */
const MIN_DISTINCT_COLORS = 256;
/** `stretch/aspect=expand` makes the viewport the window, so bars are zero. */
const MAX_LETTERBOX_PX = 0;
// Cropping is the same defect as letterboxing with the sign flipped, and under
// `stretch/aspect=expand` both are zero by construction, so the floor is the
// same number.
const MAX_OFFSCREEN_PX = 0;

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

        // WALK THE FLOW, and gate on engine errors while doing it.
        //
        // Booting is not playing. This harness used to stop at the first frame,
        // which is why it never saw `login.gd` calling `_col.add_child(_pin_edit)`
        // on a node `_make_pin_edit()` had already parented — Godot refuses that
        // with "already has a parent" on every visit to the PIN and new-player
        // screens, and the rejected add left the field looking correct, so nothing
        // anywhere noticed.
        //
        // There WAS a second harness for this (tools/godot_play_smoke.mjs). It
        // asserted the screen CHANGED between steps, using hand-tuned pixel-noise
        // floors — "noise floor 0.0066, walk change 0.0055, needs > 0.0265" — and
        // that is why it rotted unrun: flaky by construction, and nobody wanted to
        // own the thresholds. It is deleted. What actually found the bug was not a
        // pixel diff; it was the console. So this asserts only that clicking and
        // typing through the real screens produces NO engine error, which is
        // deterministic, needs no threshold, and would have failed on that bug.
        //
        // Deliberately blind clicks at the canvas centre. Coordinate-precise
        // clicking is what makes browser tests break on every layout change; the
        // point here is to exercise the screens, not to assert a layout.
        const flow = [
            ['open a screen',      async () => page.mouse.click(590, 430)],
            ['type a name',        async () => page.keyboard.type('Smoke')],
            ['type a PIN',         async () => page.keyboard.type('1234')],
            ['commit',             async () => page.keyboard.press('Enter')],
            ['advance',            async () => page.mouse.click(590, 430)],
            ['advance again',      async () => page.mouse.click(590, 430)],
            ['hold right',         async () => {
                await page.keyboard.down('ArrowRight');
                await page.waitForTimeout(1200);
                await page.keyboard.up('ArrowRight');
            }],
        ];
        if (SHOT_DIR) await mkdir(SHOT_DIR, { recursive: true });
        let step = 0;
        for (const [label, act] of flow) {
            const before = consoleErrors.length;
            await act();
            await page.waitForTimeout(1200);
            if (consoleErrors.length > before) {
                consoleErrors.push(`(the ${consoleErrors.length - before} error(s) above appeared while: ${label})`);
            }
            if (SHOT_DIR) {
                step += 1;
                const name = `${String(step).padStart(2, '0')}-${label.replace(/\W+/g, '-')}.png`;
                await page.screenshot({ path: resolve(SHOT_DIR, name) });
            }
        }

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
        // viewport, in both axes and in BOTH DIRECTIONS.
        //
        // Bars alone are half the failure. `Math.max(0, vw - width)` is
        // structurally blind to a canvas LARGER than the viewport: injecting
        // 1450x1000 into the exported build reported "0px bars, canvas covers
        // 149.9%" and passed, when a third of the frame — including whichever
        // edge the HUD lives on — was cropped off the owner's primary device.
        // Same class of defect as the hardcoded 16:9 above: a metric that can
        // only move in the direction someone thought to look.
        //
        // Offscreen is measured from the canvas's POSITION, not just its size,
        // so a correctly-sized canvas shifted out from under the viewport counts
        // too.
        const letterbox = await page.evaluate(() => {
            const c = document.querySelector('canvas');
            const r = c.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const barsH = Math.max(0, Math.round(vh - r.height));
            const barsW = Math.max(0, Math.round(vw - r.width));
            const offV = Math.max(0, Math.round(-r.top)) + Math.max(0, Math.round(r.bottom - vh));
            const offH = Math.max(0, Math.round(-r.left)) + Math.max(0, Math.round(r.right - vw));
            const usedPct = Math.round(((r.width * r.height) / (vw * vh)) * 1000) / 10;
            return {
                cssViewport: `${Math.round(vw)}x${Math.round(vh)}`,
                canvasBox: `${Math.round(r.width)}x${Math.round(r.height)}`,
                barsTotalPx: barsH + barsW,
                verticalBarsPx: barsH,
                horizontalBarsPx: barsW,
                offscreenTotalPx: offV + offH,
                verticalOffscreenPx: offV,
                horizontalOffscreenPx: offH,
                screenUsedPct: usedPct,
            };
        });

        // Whether a touch device can type at all — gate B2.
        //
        // This build shipped with html/experimental_virtual_keyboard=false, and
        // on an iPad that means creating an account is impossible. Godot draws
        // its LineEdits into the canvas, iOS Safari never raises a keyboard for
        // a <canvas>, and the engine's virtual-keyboard bridge — the one thing
        // that focuses a real DOM <input> when a LineEdit takes focus — was the
        // switched-off flag. The front door was locked on the owner's primary
        // device class for as long as it stayed false.
        //
        // Nothing here caught it, and the reason is worth keeping: the flow
        // above types with page.keyboard.type(), which fires synthetic key
        // events straight at the canvas and works perfectly on a machine with no
        // keyboard in existence. This harness emulates an iPad VIEWPORT — which
        // is why the letterbox gate exists at all — but a viewport is not an
        // input method, and every assertion here was about pixels.
        //
        // Two things are gated, both deterministic and both layout-independent.
        // experimentalVK must be on. And an <input> must be SELECTABLE: the
        // export's head_include sets `user-select:none` on html,body to stop a
        // child dragging the canvas around, an injected input inherits it, and
        // iOS will not raise a keyboard for a field it believes cannot be
        // selected — so the CSS fix and the flag are one gate, not two.
        //
        // What this does NOT prove is that iOS Safari actually shows the
        // keyboard; only a device can. Same caveat as whatThisIsNot below.
        const vk = await page.evaluate(() => {
            const probe = document.createElement('input');
            probe.type = 'text';
            document.body.appendChild(probe);
            const css = getComputedStyle(probe);
            const selectable = css.userSelect !== 'none' && css.webkitUserSelect !== 'none';
            probe.remove();
            return {
                // A top-level `const` in a classic script is a global lexical
                // binding, not a property of window — so this reads the bare
                // name rather than window.GODOT_CONFIG, which is undefined.
                experimentalVK: typeof GODOT_CONFIG !== 'undefined' && GODOT_CONFIG.experimentalVK === true,
                inputSelectable: selectable,
            };
        });

        // Whether the keyboard survives focus leaving the canvas — gate B3.
        //
        // Godot 4.3's web export binds keydown and keyup to the CANVAS element,
        // and only ever hands focus back to the canvas from a pointer or touch
        // event that landed ON the canvas. So the instant focus goes elsewhere
        // with nothing holding it, every key press after that is dropped: the
        // maths board stays on screen, the question stays on it, and answering it
        // becomes impossible. A playtester met this as "when i click out of it,
        // (the browser), it leaves the math problem or does something wierd".
        //
        // A tab switch is NOT the case that breaks — the browser hands focus back
        // to the element that had it, measured at 2.5s and 8s by
        // godot/tools/focus_loss_repro.mjs. What breaks is focus landing NOWHERE,
        // which is what Godot's own virtual-keyboard <input> leaves behind:
        // GodotDisplayVK.hide() calls elem.blur() and never refocuses the canvas,
        // and gate B2 above requires that input to exist. So B2 and B3 are two
        // halves of one thing — turning the touch keyboard on is what made a
        // dropped focus reachable in ordinary play.
        //
        // canvas.blur() models it exactly and introduces nothing synthetic. The
        // second half of the gate is the constraint the fix must not violate: a
        // real text field has to KEEP focus, or a child cannot type their name.
        const focusLoss = await (async () => {
            await page.evaluate(() => {
                const c = document.getElementById('canvas') || document.querySelector('canvas');
                window.__crowCanvasKeys = 0;
                c.addEventListener('keydown', () => { window.__crowCanvasKeys += 1; });
                c.blur();
            });
            await page.waitForTimeout(500);
            const droppedTo = await page.evaluate(() => {
                const a = document.activeElement;
                return a ? (a.id || a.tagName) : 'none';
            });
            await page.keyboard.press('ArrowRight');
            await page.waitForTimeout(300);
            const keysReachCanvas = await page.evaluate(() => window.__crowCanvasKeys > 0);

            // And a field must be left alone.
            const textFieldKeepsFocus = await page.evaluate(async () => {
                const field = document.createElement('input');
                field.type = 'text';
                field.style.cssText = 'position:fixed;left:-300px;top:0';
                document.body.appendChild(field);
                field.focus();
                await new Promise(r => setTimeout(r, 500));
                const kept = document.activeElement === field;
                field.remove();
                return kept;
            });
            return { droppedTo, keysReachCanvas, textFieldKeepsFocus };
        })();

        const result = {
            // GATED, not merely recorded. `distinctColors > 1` accepted a
            // two-colour frame as a render, and nothing checked the geometry at
            // all — so a regression to the 19.1% letterbox this project fixed
            // would have printed its number and still passed. Floors are set
            // well under what a working build measures (2714 colours, 0 bars) so
            // they fail on a real regression, not on noise.
            accepted: consoleErrors.length === 0
                && failedRequests.length === 0
                && canvas.width > 0
                && distinctColors >= MIN_DISTINCT_COLORS
                && letterbox.barsTotalPx <= MAX_LETTERBOX_PX
                && letterbox.offscreenTotalPx <= MAX_OFFSCREEN_PX
                && vk.experimentalVK
                && vk.inputSelectable
                && focusLoss.keysReachCanvas
                && focusLoss.textFieldKeepsFocus,
            kind: 'web_export_boot_smoke',
            whatThisIs: 'Exported output/web build booted in Chromium at an iPad landscape viewport with touch enabled.',
            whatThisIsNot: 'Not real iPad Safari verification. WebKit audio unlock, memory ceilings and WASM limits are unproven here.',
            viewport: IPAD,
            canvas,
            distinctCanvasColors: distinctColors,
            letterbox,
            virtualKeyboard: vk,
            focusLoss,
            consoleErrors,
            failedRequests,
            screenshot: 'output/playwright/web-boot-smoke/ipad-boot.png',
        };
        const out = resolve(ROOT, 'reports/web/boot-smoke.json');
        await mkdir(dirname(out), { recursive: true });
        await writeFile(out, JSON.stringify(result, null, 2) + '\n');

        console.log(`canvas          : ${canvas.width}x${canvas.height} (css ${canvas.clientWidth}x${canvas.clientHeight})`);
        console.log(`distinct colors : ${distinctColors} (full canvas)`);
        console.log(`ipad letterbox  : ${letterbox.barsTotalPx}px bars (${letterbox.verticalBarsPx}v/${letterbox.horizontalBarsPx}h), ${letterbox.offscreenTotalPx}px offscreen (${letterbox.verticalOffscreenPx}v/${letterbox.horizontalOffscreenPx}h), canvas covers ${letterbox.screenUsedPct}% of the viewport`);
        console.log(`flow steps      : ${flow.length} (clicks and keys after boot)`);
        console.log(`touch keyboard  : experimentalVK=${vk.experimentalVK}, input selectable=${vk.inputSelectable}`);
        console.log(`focus recovery  : after canvas.blur() focus went to ${focusLoss.droppedTo}, keys reach canvas=${focusLoss.keysReachCanvas}, text field keeps focus=${focusLoss.textFieldKeepsFocus}`);
        console.log(`console errors  : ${consoleErrors.length}`);
        if (distinctColors < MIN_DISTINCT_COLORS) {
            console.error(`FAIL: only ${distinctColors} distinct colours (floor ${MIN_DISTINCT_COLORS}) — the build booted but did not render`);
        }
        if (letterbox.barsTotalPx > MAX_LETTERBOX_PX) {
            console.error(`FAIL: ${letterbox.barsTotalPx}px of bars (floor ${MAX_LETTERBOX_PX}) — gate B1 has regressed`);
        }
        if (letterbox.offscreenTotalPx > MAX_OFFSCREEN_PX) {
            console.error(`FAIL: ${letterbox.offscreenTotalPx}px of canvas is off screen (floor ${MAX_OFFSCREEN_PX}) at ${letterbox.screenUsedPct}% coverage — the frame is being cropped, not letterboxed`);
        }
        if (!vk.experimentalVK) {
            console.error("FAIL: experimentalVK is off — a touch device cannot type, so no child can create an account. "
                + "Set html/experimental_virtual_keyboard=true in godot/export_presets.cfg and re-export.");
        }
        if (!focusLoss.keysReachCanvas) {
            console.error("FAIL: after focus left the canvas, key presses no longer reach it — gate B3. "
                + "A child who ends up with focus nowhere (Godot's virtual keyboard closing does exactly that) "
                + "gets a maths board they cannot answer. deploy/web/crow-focus.js is the fix; check it is copied "
                + "by build_web.sh and referenced from html/head_include.");
        }
        if (!focusLoss.textFieldKeepsFocus) {
            console.error("FAIL: focus was pulled off a real <input> — gate B3. The login name and PIN are served "
                + "by an injected input on a touch build, so stealing its focus dismisses the on-screen keyboard "
                + "mid-word. crow-focus.js must leave text fields alone.");
        }
        if (!vk.inputSelectable) {
            console.error("FAIL: an injected <input> computes user-select:none, inherited from the export's head_include. "
                + "iOS will not raise a keyboard for it. Allow input,textarea to be selectable.");
        }
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
