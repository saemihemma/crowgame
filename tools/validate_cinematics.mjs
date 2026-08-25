#!/usr/bin/env node
/**
 * Cinematic guard - fails the build on the ways a stills-and-camera film rots.
 *
 * The direction, and the reason behind every number below, is in
 * brand/CINEMATIC_DIRECTION.md. This file is that document made executable.
 *
 * 1. THE FRAME NEVER LEAVES THE PLATE. The one bug this kind of system always
 *    ships: a pan that runs a few pixels off the edge of the still and shows
 *    the clear colour for half a second, on someone else's device, once. It is
 *    pure arithmetic, so there is no excuse for finding it by eye.
 *
 *    Rigorous because it is linear: a layer's sampled rect has x, y, w and h
 *    all linear in t, so x+w and y+h are linear in t too and their extremes are
 *    at t=0 and t=1. Checking both endpoints checks the whole move.
 *
 * 2. GEOMETRY. Rects are 16:9 so no shot silently stretches, and zoom stays
 *    inside 1.00x-1.15x of the authored plate, which is what keeps the pixel-law
 *    exemption in CINEMATIC_DIRECTION.md 4.2 honest.
 *
 * 3. THE PLATES ARE REAL. Every declared path exists and its real PNG size is
 *    the size the data claims, so a plate redrawn at the wrong size fails here
 *    instead of quietly reframing every shot it appears in.
 *
 * 4. BUDGET. Bytes, because this film sits in front of the boot funnel, and
 *    runtime, because a six-year-old's patience is the real constraint.
 *
 * 5. CAPTIONS AND CUES RESOLVE. Every caption key in every locale (a film
 *    cannot ship half-translated), inside the word limit, and able to arrive
 *    and leave inside its own shot. Every audio key present in the manifest.
 *
 * Run: node tools/validate_cinematics.mjs
 */
import Ajv from 'ajv';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'godot/data/cinematics');
const GODOT_ROOT = join(ROOT, 'godot');
const SCHEMA = join(ROOT, 'authoring/cinematics/schemas/cinematic.schema.json');
const LOCALES = ['en', 'is'];

// brand/CINEMATIC_DIRECTION.md - 1 rule 6, 3.1, 3.4, 4.2, 4.3.
const FRAME_BASE_W = 1920;              // a 1.00x frame is 1:1 on a 2x device output
const PLATE_BLEED = 64;                 // every plate's camera-safe margin, in plate pixels
const ZOOM_MIN = 1.0;
const ZOOM_MAX = 1.15;
const ASPECT = 16 / 9;
const ASPECT_TOLERANCE = 0.004;         // ~1px of slop at 1920 wide
const TOTAL_BYTES_MAX = 2.0 * 1024 * 1024;
const PLATE_BYTES_MAX = 400 * 1024;
const RUNTIME_MAX_SEC = 60.0;
const CINE_FADE = 0.9;                  // the one duration this format adds to 9.1
const CAPTION_DELAY_DEFAULT = 0.4;
const CAPTION_CLEARANCE = 0.84;         // enter 260ms + exit 180ms + 400ms of tail
const CAPTION_MAX_WORDS = 8;            // BRAND_SYSTEM.md 4.2
const DRIFT_MAX = 5.0;

const errors = [];
const notes = [];
const fail = (m) => errors.push(m);

/** PNG dimensions from the IHDR chunk. Cheaper and more honest than decoding. */
function pngSize(absPath) {
    const buf = readFileSync(absPath);
    if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function loadJson(absPath) {
    return JSON.parse(readFileSync(absPath, 'utf8'));
}

function loadBundles() {
    const out = {};
    for (const locale of LOCALES) {
        const p = join(GODOT_ROOT, `data/i18n/strings_${locale}.json`);
        out[locale] = existsSync(p) ? loadJson(p) : null;
        if (!out[locale]) fail(`string bundle missing: ${p}`);
    }
    return out;
}

function loadAudioKeys() {
    const manifest = loadJson(join(GODOT_ROOT, 'data/audio/audio_manifest.json'));
    const events = loadJson(join(GODOT_ROOT, 'data/audio/sound_events.json'));
    return {
        music: new Set(Object.keys(manifest.music ?? {})),
        events: new Set(Object.keys(events).filter((k) => !k.startsWith('_'))),
    };
}

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Check 1 + 2: for one layer of one shot, does the camera stay on the plate,
 * is every rect 16:9, and is the zoom inside the exemption's range.
 */
function checkFraming(where, shot, layer, size) {
    const parallax = layer.parallax ?? 1.0;
    const drift = layer.drift ?? [0, 0];
    const margin = [Math.abs(drift[0]), Math.abs(drift[1])];

    const from = shot.move.from;
    const to = shot.move.to;

    for (const [label, rect] of [['from', from], ['to', to]]) {
        const [, , w, h] = rect;
        if (Math.abs(w / h - ASPECT) > ASPECT_TOLERANCE)
            fail(`${where} ${label} rect is ${w}x${h}, which is not 16:9 - the shot would stretch`);
        const zoom = FRAME_BASE_W / w;
        if (zoom < ZOOM_MIN - 1e-6 || zoom > ZOOM_MAX + 1e-6)
            fail(`${where} ${label} rect zooms ${zoom.toFixed(3)}x, outside ${ZOOM_MIN}-${ZOOM_MAX} (CINEMATIC_DIRECTION.md 4.2)`);
    }

    // Linear in t, so the endpoints bound the whole move.
    for (const t of [0, 1]) {
        const x = from[0] + (to[0] - from[0]) * t * parallax;
        const y = from[1] + (to[1] - from[1]) * t * parallax;
        const w = lerp(from[2], to[2], t);
        const h = lerp(from[3], to[3], t);
        if (x - margin[0] < -1e-6 || y - margin[1] < -1e-6)
            fail(`${where} runs off the top/left of the plate at t=${t} (x=${(x - margin[0]).toFixed(1)}, y=${(y - margin[1]).toFixed(1)})`);
        if (x + w + margin[0] > size.w + 1e-6)
            fail(`${where} runs ${(x + w + margin[0] - size.w).toFixed(1)}px off the right of the plate at t=${t}`);
        if (y + h + margin[1] > size.h + 1e-6)
            fail(`${where} runs ${(y + h + margin[1] - size.h).toFixed(1)}px off the bottom of the plate at t=${t}`);
    }

    for (const [label, rect] of [['from', from], ['to', to]]) {
        const [x, y, w, h] = rect;
        if (x < PLATE_BLEED || y < PLATE_BLEED || x + w > size.w - PLATE_BLEED || y + h > size.h - PLATE_BLEED)
            fail(`${where} ${label} rect touches the plate's ${PLATE_BLEED}px camera bleed - parallax and drift need somewhere to go, so no rect enters it`);
    }

    if (Math.abs(drift[0]) > DRIFT_MAX || Math.abs(drift[1]) > DRIFT_MAX)
        fail(`${where} drifts more than ${DRIFT_MAX}px - above that it reads as a sprite sliding, not as air`);
    if (parallax > 1.0 + 1e-6)
        fail(`${where} has parallax ${parallax}; a layer never takes more of the move than the frame does`);
}

function validateOne(file, cine, schemaCheck, bundles, audio) {
    const rel = `godot/data/cinematics/${file}`;

    if (!schemaCheck(cine)) {
        for (const e of schemaCheck.errors ?? []) fail(`${rel}${e.instancePath} ${e.message}`);
        return { bytes: 0, seconds: 0 };
    }

    const expectedId = file.replace(/\.json$/, '');
    if (cine.id !== expectedId)
        fail(`${rel} declares id "${cine.id}" but is named ${file} - the id, the filename and the DataManager key are one name`);

    const seenShotIds = new Set();
    const seenPlates = new Set();
    let bytes = 0;
    let seconds = 0;

    for (const [i, shot] of cine.shots.entries()) {
        const where0 = `${rel} shot ${i + 1} (${shot.id})`;
        if (seenShotIds.has(shot.id)) fail(`${where0}: duplicate shot id`);
        seenShotIds.add(shot.id);

        seconds += shot.hold + (shot.transition ?? CINE_FADE);

        // ── captions ────────────────────────────────────────────────────────
        if (shot.caption) {
            for (const locale of LOCALES) {
                const bundle = bundles[locale];
                if (!bundle) continue;
                if (!(shot.caption in bundle)) {
                    fail(`${where0}: caption "${shot.caption}" is missing from strings_${locale}.json - a film cannot ship half-translated`);
                    continue;
                }
                const words = String(bundle[shot.caption]).trim().split(/\s+/).filter(Boolean);
                if (words.length > CAPTION_MAX_WORDS)
                    fail(`${where0}: caption in ${locale} is ${words.length} words, over the ${CAPTION_MAX_WORDS}-word limit (BRAND_SYSTEM.md 4.2)`);
            }
            const delay = shot.captionDelay ?? CAPTION_DELAY_DEFAULT;
            if (delay + CAPTION_CLEARANCE > shot.hold + 1e-6)
                fail(`${where0}: caption arrives at ${delay}s and cannot land and leave inside a ${shot.hold}s hold - a caption never crosses a transition`);
        } else if (shot.captionDelay !== undefined) {
            fail(`${where0}: captionDelay set on a shot with no caption`);
        }

        // ── audio ───────────────────────────────────────────────────────────
        if (shot.music && !audio.music.has(shot.music))
            fail(`${where0}: music "${shot.music}" is not in audio_manifest.json`);
        if (shot.sfx && !audio.events.has(shot.sfx))
            fail(`${where0}: sfx "${shot.sfx}" is not in sound_events.json`);
        if (shot.sfx && (shot.sfxAt ?? 0) > shot.hold + 1e-6)
            fail(`${where0}: sfx fires at ${shot.sfxAt}s, past the end of a ${shot.hold}s hold`);
        if (!shot.sfx && shot.sfxAt !== undefined)
            fail(`${where0}: sfxAt set on a shot with no sfx`);

        // ── plates ──────────────────────────────────────────────────────────
        for (const [j, layer] of shot.layers.entries()) {
            const where = `${where0} layer ${j + 1} (${layer.src})`;
            const abs = join(GODOT_ROOT, layer.src);

            if (!existsSync(abs)) {
                fail(`${where}: plate missing. Run \`node tools/gen_placeholder_cinematic.mjs\` for a stand-in.`);
                continue;
            }

            const real = pngSize(abs);
            if (!real) {
                fail(`${where}: not a readable PNG`);
                continue;
            }
            const [dw, dh] = layer.size;
            if (real.w !== dw || real.h !== dh)
                fail(`${where}: plate is ${real.w}x${real.h} but the data says ${dw}x${dh} - every shot it appears in is reframed`);

            const size = statSync(abs).size;
            if (size > PLATE_BYTES_MAX)
                fail(`${where}: ${(size / 1024).toFixed(0)} KB, over the ${PLATE_BYTES_MAX / 1024} KB per-plate cap. Fewer layers or flatter art, never a bigger budget.`);
            if (!seenPlates.has(layer.src)) {
                seenPlates.add(layer.src);
                bytes += size;
            }

            checkFraming(where, shot, layer, real);
        }
    }

    notes.push(`${cine.id}: ${cine.shots.length} shots, ${seconds.toFixed(1)}s, ${seenPlates.size} plates, ${(bytes / 1024).toFixed(0)} KB`);

    if (seconds > RUNTIME_MAX_SEC)
        fail(`${rel}: ${seconds.toFixed(1)}s total, over the ${RUNTIME_MAX_SEC}s cap. A six-year-old's patience is the budget.`);

    return { bytes, seconds };
}

function main() {
    if (!existsSync(DATA_DIR)) {
        console.log('cinematic guard: no godot/data/cinematics/, nothing to check');
        return;
    }

    const schema = loadJson(SCHEMA);
    const ajv = new Ajv({ allErrors: true, strict: false });
    const schemaCheck = ajv.compile(schema);
    const bundles = loadBundles();
    const audio = loadAudioKeys();

    const files = readdirSync(DATA_DIR).filter((f) => f.endsWith('.json')).sort();
    if (files.length === 0) fail('godot/data/cinematics/ exists but holds no cinematic');

    let totalBytes = 0;
    for (const file of files) {
        const { bytes } = validateOne(file, loadJson(join(DATA_DIR, file)), schemaCheck, bundles, audio);
        totalBytes += bytes;
    }

    if (totalBytes > TOTAL_BYTES_MAX)
        fail(`cinematic plates total ${(totalBytes / 1024 / 1024).toFixed(2)} MB, over the ${(TOTAL_BYTES_MAX / 1024 / 1024).toFixed(1)} MB cap - this payload sits in front of the boot funnel`);

    if (errors.length) {
        console.error(`\ncinematic guard: ${errors.length} problem${errors.length === 1 ? '' : 's'}\n`);
        for (const e of errors) console.error(`  - ${e}`);
        process.exit(1);
    }

    console.log(`cinematic guard: clean (${notes.length} cinematic${notes.length === 1 ? '' : 's'}, ${(totalBytes / 1024).toFixed(0)} KB of ${(TOTAL_BYTES_MAX / 1024).toFixed(0)} KB budget)`);
    for (const n of notes) console.log(`  ${n}`);
}

main();
