#!/usr/bin/env node
/**
 * Assemble generated art into the plates the game loads.
 *
 * This is the half of the pipeline that delivers consistency. Characters are
 * generated once by tools/gen_art.mjs and then PLACED here -- the same pixels
 * every time -- so Hörmann cannot drift between shots the way he would if each
 * plate re-prompted him. brand/ART_PROMPTBOOK.md §1 and §8.
 *
 * The ```compose blocks in the promptbook are the layout. Each names a plate,
 * its final size, and the layers to write:
 *
 *   - `fit: cover`  fills the plate with a background, cropping to the centre.
 *   - a placed asset is trimmed to its content bounds, scaled to `w` (a fraction
 *     of plate width) and positioned by `x`/`y` (fractions) at `anchor`.
 *   - `over:` composites extra assets onto the layer being written.
 *   - `with:` is the same thing; it reads better on a character layer.
 *   - `mask: circle` clips an asset to a circle -- the view through Vala's ring.
 *   - `behind: true` puts an asset under the ones already placed on that layer.
 *
 * Everything is upscaled: the image model tops out at 1536px and a plate is
 * 2048 or 2688 wide (promptbook §2), so each layer gets a light sharpen to take
 * the edge off the 1.33x-1.75x enlargement.
 *
 * Run: node tools/compose_plates.mjs
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BOOK = join(ROOT, 'brand/ART_PROMPTBOOK.md');
const ART = join(ROOT, 'ai_assets/art');
const DEST = join(ROOT, 'godot/assets/cinematics/prologue');
/** Mild, because the source is flat painted shapes and over-sharpening them looks like a filter. */
const SHARPEN = { sigma: 0.8 };
/**
 * Palette PNG, not truecolour. A 2048x1208 painted plate lands around 1-2 MB as
 * truecolour, and CINEMATIC_DIRECTION.md 4.3 caps a plate at 400 KB and the film
 * at 2 MB because this payload sits in front of the boot funnel. The house style
 * is deliberately flat shapes in a limited palette, so 256 colours is nearly
 * lossless for it and costs a fraction of the bytes -- the art direction and the
 * byte budget happen to want the same thing.
 */
const PNG_OUT = { palette: true, quality: 92, effort: 9, compressionLevel: 9 };

const missing = [];

function fences(md, lang) {
    const out = [];
    const re = new RegExp('^```' + lang + '\\n([\\s\\S]*?)^```', 'gm');
    let m;
    while ((m = re.exec(md)) !== null) out.push(m[1]);
    return out;
}

/** `key: value` pairs on one line, as the compose blocks write them. */
function inline(text) {
    const spec = {};
    const re = /([a-z]+):\s*([^\s]+)/g;
    let m;
    while ((m = re.exec(text)) !== null) spec[m[1]] = m[2];
    return spec;
}

/**
 * The compose blocks are a deliberately small subset of YAML, parsed by hand so
 * the promptbook needs no dependency to stay readable.
 */
function parseCompose(text) {
    const lines = text.split('\n').filter((l) => l.trim());
    const plate = { layers: [] };
    let layer = null;
    let bucket = null;

    for (const raw of lines) {
        const indent = raw.length - raw.trimStart().length;
        const line = raw.trim();

        if (line.startsWith('plate:')) { plate.id = line.slice(6).trim(); continue; }
        if (line.startsWith('size:')) {
            const [w, h] = line.slice(5).trim().split('x').map(Number);
            plate.w = w; plate.h = h; continue;
        }
        if (line === 'layers:') continue;

        if (line.startsWith('- ') && indent <= 2) {
            layer = { ...inline(line.slice(2)), over: [] };
            plate.layers.push(layer);
            bucket = null;
            continue;
        }
        if (line === 'over:' || line === 'with:') { bucket = layer.over; continue; }
        if (line.startsWith('- ') && bucket) { bucket.push(inline(line.slice(2))); continue; }
        // a continuation line of the current layer's own properties
        if (layer && !bucket) Object.assign(layer, inline(line));
    }
    return plate;
}

function assetPath(id) {
    const p = join(ART, `${id}.png`);
    if (!existsSync(p)) {
        missing.push(id);
        return null;
    }
    return p;
}

/** Trim transparent margin so `w` means the width of the subject, not of the canvas. */
async function trimmed(path) {
    try {
        return await sharp(path).trim().png().toBuffer();
    } catch {
        // A fully opaque or fully empty image has nothing to trim.
        return await sharp(path).png().toBuffer();
    }
}

async function circleMask(buf) {
    const { width, height } = await sharp(buf).metadata();
    const d = Math.min(width, height);
    const svg = Buffer.from(
        `<svg width="${width}" height="${height}"><circle cx="${width / 2}" cy="${height / 2}" r="${d / 2}" fill="#fff"/></svg>`
    );
    return sharp(buf)
        .composite([{ input: svg, blend: 'dest-in' }])
        .png()
        .toBuffer();
}

/** Where the top-left of a placed asset goes, given the point its x/y names. */
function place(spec, plate, w, h) {
    const cx = Number(spec.x ?? 0.5) * plate.w;
    const cy = Number(spec.y ?? 0.5) * plate.h;
    const anchor = spec.anchor ?? 'center';
    let left = cx - w / 2;
    let top = cy - h / 2;
    if (anchor === 'bottom') top = cy - h;
    else if (anchor === 'top') top = cy;
    else if (anchor === 'right') left = cx - w;
    else if (anchor === 'left') left = cx;
    return { left: Math.round(left), top: Math.round(top) };
}

/**
 * An asset placed larger than the plate is not a mistake -- Grubb is supposed to
 * run off every edge of his shot (promptbook, char.grubb.back). So anything
 * hanging outside the canvas is cropped away here rather than handed to sharp,
 * which refuses to composite an overlay bigger than what it is going onto.
 */
async function placed(spec, plate) {
    const src = assetPath(spec.from);
    if (!src) return null;

    let buf = await trimmed(src);
    if (spec.mask === 'circle') buf = await circleMask(buf);

    const meta = await sharp(buf).metadata();
    const targetW = Math.max(1, Math.round(Number(spec.w ?? 0.2) * plate.w));
    const targetH = Math.max(1, Math.round((meta.height / meta.width) * targetW));

    buf = await sharp(buf).resize(targetW, targetH, { fit: 'fill' }).sharpen(SHARPEN).png().toBuffer();

    const { left, top } = place(spec, plate, targetW, targetH);
    const srcLeft = Math.max(0, -left);
    const srcTop = Math.max(0, -top);
    const visW = Math.min(targetW - srcLeft, plate.w - Math.max(0, left));
    const visH = Math.min(targetH - srcTop, plate.h - Math.max(0, top));
    if (visW <= 0 || visH <= 0) {
        console.log(`  -- ${spec.from} placed entirely outside the plate; skipped`);
        return null;
    }
    if (srcLeft || srcTop || visW !== targetW || visH !== targetH) {
        buf = await sharp(buf)
            .extract({ left: srcLeft, top: srcTop, width: visW, height: visH })
            .png()
            .toBuffer();
    }
    return { input: buf, left: Math.max(0, left), top: Math.max(0, top) };
}

async function background(spec, plate) {
    const src = assetPath(spec.from);
    if (!src) return null;
    return sharp(src)
        .resize(plate.w, plate.h, { fit: 'cover', position: 'centre' })
        .sharpen(SHARPEN)
        .png()
        .toBuffer();
}

async function composeLayer(layer, plate) {
    const canvas = sharp({
        create: { width: plate.w, height: plate.h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    });

    const overlays = [];

    if (layer.fit === 'cover') {
        const bg = await background(layer, plate);
        if (bg) overlays.push({ input: bg, left: 0, top: 0 });
    } else {
        const main = await placed(layer, plate);
        if (main) overlays.push(main);
    }

    // `behind: true` sits under whatever is already on this layer -- the street
    // seen through the ring goes under the ring's own glowing rim.
    const behind = [];
    const front = [];
    for (const spec of layer.over) (spec.behind === 'true' ? behind : front).push(spec);
    for (const spec of [...behind, ...front]) {
        const o = await placed(spec, plate);
        if (o) (spec.behind === 'true' ? overlays.unshift(o) : overlays.push(o));
    }

    if (overlays.length === 0) return null;
    return canvas.composite(overlays).png(PNG_OUT).toBuffer();
}

async function main() {
    const plates = fences(readFileSync(BOOK, 'utf8'), 'compose').map(parseCompose);
    if (plates.length === 0) {
        console.error('the promptbook declares no ```compose blocks');
        process.exit(1);
    }

    await mkdir(DEST, { recursive: true });
    let written = 0;
    let skipped = 0;

    for (const plate of plates) {
        if (!plate.w || !plate.h) throw new Error(`compose block "${plate.id}" has no size`);
        console.log(`${plate.id}  ${plate.w}x${plate.h}`);
        for (const layer of plate.layers) {
            if (!layer.out) throw new Error(`a layer of "${plate.id}" has no out:`);
            const png = await composeLayer(layer, plate);
            if (!png) {
                console.log(`  -- ${layer.out}  (source missing, left alone)`);
                skipped++;
                continue;
            }
            await writeFile(join(DEST, layer.out), png);
            console.log(`  ok ${layer.out.padEnd(24)} ${(png.length / 1024).toFixed(0)} KB`);
            written++;
        }
    }

    if (missing.length) {
        const unique = [...new Set(missing)];
        console.log(`\n${unique.length} generated asset(s) not present yet:`);
        for (const id of unique) console.log(`  ${id}`);
        console.log('Run `npm run art:gen` (needs OPENAI_API_KEY), then compose again.');
    }

    console.log(`\n${written} layer(s) written to godot/assets/cinematics/prologue/${skipped ? `, ${skipped} skipped` : ''}.`);
    if (written) console.log('Now check the contract holds:  npm run validate:cinematics');
}

main().catch((err) => {
    console.error(`\n${err.message}`);
    process.exit(1);
});
