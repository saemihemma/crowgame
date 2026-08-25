#!/usr/bin/env node
/**
 * Placeholder plates for every cinematic layer the data declares.
 *
 * Same contract as tools/gen_placeholder_art.mjs and for the same reason: the
 * film should run, and its timing, framing, captions and handoff should be
 * judgeable, before anyone paints anything. brand/PRODUCTION_PLAN.md Decision 3
 * says the user draws the art; this is how that promise costs nothing.
 *
 * Deliberately plain - flat fills, hard edges, no gradients, no rendering - so
 * nobody can mistake one of these for shipped work. Two placeholder features
 * are not decoration and should survive into how you judge a shot:
 *
 *   - A 6px INK frame inset at every plate's edge. If a camera move runs off
 *     the plate, that frame slides into view and you see it immediately rather
 *     than wondering why the corner flickered. (tools/validate_cinematics.mjs
 *     proves it arithmetically; this is the version you can see.)
 *   - A row of tally marks in the top-left counting the shot index, so you
 *     always know which plate is on screen without reading anything.
 *
 * Sizes and paths come from godot/data/cinematics/*.json - this tool never
 * invents a plate the data did not ask for.
 *
 * Run: node tools/gen_placeholder_cinematic.mjs
 */
import sharp from 'sharp';
import { mkdir, readdir, readFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'godot/data/cinematics');
const ASSET_ROOT = join(ROOT, 'godot');

// brand/BRAND_SYSTEM.md 6.1 - the Fixed Nine.
const INK = [0x1a, 0x14, 0x20];
const PAPER = [0xff, 0xf8, 0xe7];
const COIN = [0xff, 0xc9, 0x3c];
const OWL = [0xff, 0xe9, 0xa8];
const HERO = [0xe2, 0x3b, 0x3b];

// brand/BRAND_SYSTEM.md 6.4 - the worlds each shot borrows its light from.
const SPIRE = { sky: [0x1b, 0x22, 0x3e], land: [0x3a, 0x6e, 0xa8], light: [0xa9, 0x7b, 0xff] };
const HOLLOW = { sky: [0x16, 0x14, 0x30], land: [0x2b, 0x2a, 0x5e], light: [0x4d, 0xe3, 0xff] };
const EMBER = { sky: [0xf6, 0xc0, 0x92], land: [0x3f, 0x8f, 0x5b], light: [0xff, 0xd9, 0x8a] };

/** Which world's light each shot sits in, by shot id. */
const SHOT_WORLD = {
    tally: SPIRE,
    bead: SPIRE,
    claw: SPIRE,
    miscount: SPIRE,
    immensity: HOLLOW,
    stuck: EMBER,
    hero: EMBER,
};

/** A raw RGBA canvas that draws in whole pixels. */
class Canvas {
    constructor(w, h) {
        this.w = w;
        this.h = h;
        this.buf = Buffer.alloc(w * h * 4, 0);
    }
    set(x, y, [r, g, b], a = 255) {
        x = Math.round(x); y = Math.round(y);
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
        const i = (y * this.w + x) * 4;
        this.buf[i] = r; this.buf[i + 1] = g; this.buf[i + 2] = b; this.buf[i + 3] = a;
    }
    rect(x, y, w, h, c, a = 255) {
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, a);
    }
    /** Hollow rectangle, drawn inward from the given edge. */
    frame(x, y, w, h, c, t) {
        for (let k = 0; k < t; k++) {
            this.rect(x + k, y + k, w - k * 2, 1, c);
            this.rect(x + k, y + h - 1 - k, w - k * 2, 1, c);
            this.rect(x + k, y + k, 1, h - k * 2, c);
            this.rect(x + w - 1 - k, y + k, 1, h - k * 2, c);
        }
    }
    disc(cx, cy, r, c, a = 255) {
        for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
            for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
                if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.set(x, y, c, a);
    }
    /** Filled triangle, for the crow and the claw. */
    tri(ax, ay, bx, by, cx, cy, c) {
        const minX = Math.floor(Math.min(ax, bx, cx)), maxX = Math.ceil(Math.max(ax, bx, cx));
        const minY = Math.floor(Math.min(ay, by, cy)), maxY = Math.ceil(Math.max(ay, by, cy));
        const side = (px, py, x1, y1, x2, y2) => (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1);
        for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
            const d1 = side(x, y, ax, ay, bx, by);
            const d2 = side(x, y, bx, by, cx, cy);
            const d3 = side(x, y, cx, cy, ax, ay);
            if ((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0)) this.set(x, y, c);
        }
    }
    async write(absPath) {
        await mkdir(dirname(absPath), { recursive: true });
        await sharp(this.buf, { raw: { width: this.w, height: this.h, channels: 4 } })
            .png({ compressionLevel: 9, palette: true })
            .toFile(absPath);
    }
}

/**
 * The two things every placeholder plate carries: the edge frame that makes an
 * off-plate camera move visible, and the tally marks that say which shot it is.
 */
function stamp(c, shotIndex) {
    c.frame(0, 0, c.w, c.h, INK, 6);
    for (let i = 0; i <= shotIndex; i++) c.rect(28 + i * 22, 28, 10, 54, PAPER, 210);
}

/** Back layer: two flat bands and a horizon. Opaque. */
function backPlate(c, world, shotIndex) {
    const horizon = Math.round(c.h * 0.66);
    c.rect(0, 0, c.w, horizon, world.sky);
    c.rect(0, horizon, c.w, c.h - horizon, world.land);
    c.rect(0, horizon - 3, c.w, 3, INK);
    stamp(c, shotIndex);
}

/**
 * Mid layer: one flat silhouette per shot, chosen so the shot is recognisable
 * at a glance and nothing more. Transparent everywhere else.
 */
function midPlate(c, shot, shotIndex) {
    const mx = c.w / 2, my = c.h / 2;
    switch (shot) {
        case 'tally': {                                    // a tower of counted things
            const tw = Math.round(c.w * 0.16);
            c.rect(mx - tw / 2, my - 260, tw, 700, INK);
            for (let i = 0; i < 7; i++) c.disc(mx, my - 200 + i * 90, 16, OWL, 235);
            break;
        }
        case 'bead': {                                     // one bead on a wire
            c.rect(0, my, c.w, 10, INK);
            c.disc(mx, my + 5, 150, COIN);
            c.disc(mx, my + 5, 150 - 14, OWL, 200);
            break;
        }
        case 'claw': {                                     // a claw out of the dark
            c.rect(0, my, c.w, 10, INK);
            c.disc(mx + 190, my + 5, 120, COIN);
            c.tri(c.w, my - 420, c.w, my + 300, mx + 40, my - 40, INK);
            break;
        }
        case 'miscount': {                                 // the stack coming apart
            for (let i = 0; i < 6; i++) {
                const off = (i % 2 ? 1 : -1) * (40 + i * 46);
                c.rect(mx - 150 + off, my - 300 + i * 104, 300, 74, INK);
            }
            break;
        }
        case 'immensity': {                                // too big for the frame
            c.rect(-40, my - 120, c.w + 80, c.h, INK);
            for (let i = 0; i < 9; i++) c.disc(240 + i * 236, my - 60, 62, INK);
            c.disc(c.w - 470, my - 40, 96, COIN);          // the eye, where the pan reaches it
            c.disc(c.w - 470, my - 40, 40, INK);
            c.rect(mx - 330, my + 40, 660, 120, OWL, 235); // the bib
            break;
        }
        case 'stuck': {                                    // an owl in a split trunk
            c.rect(mx - 130, my - 420, 260, c.h, INK);
            c.disc(mx, my + 40, 118, OWL);
            c.disc(mx - 44, my + 10, 26, INK);
            c.disc(mx + 44, my + 10, 26, INK);
            c.rect(mx - 210, my + 210, 420, 22, PAPER, 225); // the chain, across the perch
            break;
        }
        case 'hero': {                                     // small, and leaving
            const hx = mx - 120, hy = my + 120;
            c.tri(hx - 70, hy, hx + 70, hy - 34, hx + 10, hy + 66, INK);
            c.rect(hx + 30, hy - 12, 130, 16, HERO);       // the scarf
            break;
        }
        default:
            c.disc(mx, my, Math.min(c.w, c.h) * 0.18, INK);
    }
    stamp(c, shotIndex);
}

/** Front layer: sparse air. Transparent, and never dense enough to read as art. */
function frontPlate(c, world, shotIndex, seed) {
    let s = seed * 7919 + 13;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 46; i++) c.disc(rnd() * c.w, rnd() * c.h, 5 + rnd() * 7, world.light, 190);
    stamp(c, shotIndex);
}

async function main() {
    const files = (await readdir(DATA_DIR)).filter((f) => f.endsWith('.json'));
    let written = 0;

    for (const file of files) {
        const cine = JSON.parse(await readFile(join(DATA_DIR, file), 'utf8'));
        for (const [shotIndex, shot] of cine.shots.entries()) {
            const world = SHOT_WORLD[shot.id] ?? SPIRE;
            for (const [layerIndex, layer] of shot.layers.entries()) {
                const [w, h] = layer.size;
                const c = new Canvas(w, h);
                if (layerIndex === 0) {
                    backPlate(c, world, shotIndex);
                    // A single-layer shot has nowhere else to put its subject, and
                    // shot 3 -- the claw, the most important frame in the film --
                    // is exactly that. Without this it rendered as empty sky.
                    if (shot.layers.length === 1) midPlate(c, shot.id, shotIndex);
                } else if (layerIndex === shot.layers.length - 1 && shot.layers.length > 2) {
                    frontPlate(c, world, shotIndex, shotIndex * 10 + layerIndex);
                } else {
                    midPlate(c, shot.id, shotIndex);
                }
                await c.write(join(ASSET_ROOT, layer.src));
                written++;
            }
        }
        console.log(`${file}: ${cine.shots.length} shots`);
    }
    console.log(`\n${written} placeholder plates written under godot/assets/cinematics/.`);
    console.log('Replacing one is dropping a PNG of the same size over it.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
