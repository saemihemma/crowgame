#!/usr/bin/env node
/**
 * Seed generator for the five world tilesets.
 *
 * These are ART-DIRECTED PLACEHOLDERS, not finished art. They exist so the five
 * worlds stop sharing one ground while the real tiles get drawn, and so the
 * geometry contract (below) is proven correct before an artist spends time on it.
 * Hand-drawn tiles will beat these; see brand/ASSET_MANIFEST.md for what to draw.
 *
 * THE CONTRACT, read out of tools/level_compiler.ts - do not guess at this:
 *   sheet      128x128, 4 columns x 4 rows, 16 tiles of 32px
 *   firstgid   1, so map GID n renders tile index n-1
 *   index 0    ground surface - the top row of a `ground` platform
 *   index 1    ground fill    - everything below a ground platform
 *   index 2    floating platform - a whole `platform`, one tile tall
 *   index 3-15 unused by the compiler today. Reserved.
 *
 * Only three tiles are ever placed. Every one of them must tile seamlessly on x
 * (a ground run is the same tile repeated), and index 1 must also tile on y.
 * Index 2 is filled to the full 32px because tilemap collision is per-tile: art
 * thinner than the tile would leave invisible collision above the visible ledge.
 *
 *   node tools/gen_tilesets.mjs            # writes both runtimes
 *   node tools/gen_tilesets.mjs --check    # verify on-disk files are current
 */
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

const TILE = 32;
const COLS = 4;
const ROWS = 4;
const SHEET = TILE * COLS;

// One tree. public/** was a byte-identical duplicate of godot/** kept alive
// only by this generator, and two data trees that nothing syncs is not a backup
// - it is a drift waiting to happen. It already had: the owl roster survived in
// one and not the other through a merge.
const OUT_DIRS = ['godot/assets/tilesets'];
const MANIFEST = 'godot/data/tilesets/tileset_manifest.json';

// ── colour ramps ────────────────────────────────────────────────────────────
// Two tokens are not enough to shade a tile. Each material expands to a 5-step
// ramp with deliberate separation, because a narrow range is what made the first
// pass read as flat - Sugarstorm was pink on pink with no discernible top.

const hex = (h) => {
    const t = h.replace('#', '');
    return [0, 2, 4].map(i => parseInt(t.slice(i, i + 2), 16));
};

const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

const clamp8 = (v) => Math.max(0, Math.min(255, Math.round(v)));

/**
 * Toward white (t > 0) or black (t < 0), preserving hue so derived shades stay
 * inside the tolerance the theme conformance check allows.
 *
 * `t` is clamped: the ramp spread below can ask for -1.05, and an unclamped
 * `v * (1 + t)` then goes negative and wraps to white in the pixel buffer.
 */
const shade = ([r, g, b], tRaw) => {
    const t = Math.max(-0.92, Math.min(0.92, tRaw));
    return t >= 0
        ? [r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t].map(clamp8)
        : [r * (1 + t), g * (1 + t), b * (1 + t)].map(clamp8);
};

const mix = (a, b, t) => a.map((v, i) => clamp8(v + (b[i] - v) * t));

/**
 * Build the ramp. `spread` widens it when the two source tokens sit close in
 * luminance, which is exactly the Sugarstorm and Aurora Spire case.
 */
function ramp(litHex, shadowHex) {
    const lit = hex(litHex);
    const shadow = hex(shadowHex);
    const tokensAreClose = Math.abs(lum(lit) - lum(shadow)) < 0.22;
    const spread = tokensAreClose ? 1.7 : 1.0;

    return {
        hi:     shade(lit, 0.30 * spread),
        lit,
        mid:    mix(lit, shadow, 0.55),
        shadow,
        deep:   shade(shadow, -0.42 * spread),
        deeper: shade(shadow, -0.62 * spread),
    };
}

// ── clustered noise ─────────────────────────────────────────────────────────
// A per-pixel hash gives white noise, which is what made the first pass look
// like sandpaper. Sampling on a coarse cell grid gives blobs instead, which is
// how hand-drawn texture actually behaves.

function hash(x, y, salt = 0) {
    let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/**
 * Noise quantised to `cell`-pixel blocks, so texture comes out as blobs rather
 * than as white noise.
 *
 * `cell` MUST divide TILE. The x term wraps on `TILE / cell`, so a cell of 3 or
 * 6 leaves a partial block at the tile edge and hardens the field into one fixed
 * motif - which is what was still showing through as a recurring pattern in the
 * basalt and the stone after the non-figurative pass. The guard makes that a
 * crash rather than a subtle artefact.
 */
const clump = (x, y, cell, salt) => {
    if (TILE % cell !== 0) throw new Error(`clump cell ${cell} does not divide ${TILE}`);
    return hash(Math.floor(x / cell) % (TILE / cell), Math.floor(y / cell), salt);
};

const BAYER = [
    [0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5],
].flat();
const bayer = (x, y) => BAYER[(y % 4) * 4 + (x % 4)] / 16;

// ── canvas ──────────────────────────────────────────────────────────────────

class Sheet {
    constructor() {
        this.data = Buffer.alloc(SHEET * SHEET * 4, 0);
    }

    set(x, y, [r, g, b], a = 255) {
        if (x < 0 || y < 0 || x >= SHEET || y >= SHEET) return;
        const i = (y * SHEET + x) * 4;
        this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = a;
    }

    toPng() {
        return sharp(this.data, { raw: { width: SHEET, height: SHEET, channels: 4 } })
            .png({ compressionLevel: 9, palette: true }).toBuffer();
    }
}

// ── the three tiles ─────────────────────────────────────────────────────────

/**
 * Vertical structure, shared by all five worlds so the ground reads the same way
 * everywhere. Two rules the first pass broke:
 *
 * - The surface band is 12px, not 6px. The player's eye tracks the top of the
 *   ground; a thin cap reads as a stripe painted on a wall.
 * - `fill` is pushed distinctly darker and much calmer than `surface`. Depth in
 *   a tall ground column comes from the value drop between the two tiles, and
 *   the first pass had them nearly identical.
 */
function paintTile(sheet, index, m, kind, cap = null, mark = null) {
    const ox = (index % COLS) * TILE;
    const oy = Math.floor(index / COLS) * TILE;
    const px = (x, y, c, a) => sheet.set(ox + x, oy + y, c, a);

    const r = m.ramp;
    const ink = hex(m.ink);
    const accent = hex(m.accent);

    if (kind === 'scatter') {
        paintScatter(px, mark, r, ink, accent, m.seed);
        return;
    }

    const isFill = kind === 'fill';
    const isPlatform = kind === 'platform';

    // A platform is one tile tall and collides across its whole 32px, so it is
    // filled to the last row. Art thinner than the tile leaves invisible
    // collision above the visible ledge.
    const bandEnd = isPlatform ? 10 : 12;
    const undersideTop = 27;

    for (let x = 0; x < TILE; x++) {
        let jitter = 0;
        if (m.boundary === 'ragged') {
            // Deep enough to read as organic. 1-2px was too timid to see.
            jitter = Math.floor(clump(x, 0, 2, m.seed) * 5) - 1;
        } else if (m.boundary === 'stepped') {
            jitter = [0, 2, 1, 3][Math.floor(x / 8) % 4];
        }
        const edge = bandEnd + jitter;

        for (let y = 0; y < TILE; y++) {
            let c;

            if (isFill) {
                // Calm body. Sparse clustered mottle only - large flat areas are
                // correct here, they are what let the surface tile read as an edge.
                const n = clump(x, y, 4, m.seed + 17);
                c = n > 0.88 ? r.shadow : n < 0.10 ? r.deeper : r.deep;
            } else if (y === 0) {
                c = ink;
            } else if (y <= 2) {
                c = r.hi;
            } else if (y <= edge) {
                const n = clump(x, y, 2, m.seed + 5);
                c = n > 0.84 ? r.hi : r.lit;
            } else if (y <= edge + 3) {
                c = bayer(x, y) < (y - edge) / 4 ? r.mid : r.lit;
            } else if (isPlatform && y >= undersideTop) {
                c = y === TILE - 1 ? ink : y === undersideTop ? r.deep : r.deeper;
            } else {
                // Body darkens with depth and lands on the same value the fill
                // tile starts from, so a tall column does not band every 32px.
                const t = Math.min(1, (y - edge - 3) / 12);
                const base = mix(r.mid, r.deep, t);
                const n = clump(x, y, 4, m.seed + 11);
                c = n > 0.90 ? r.shadow : n < 0.12 ? r.deeper : base;
            }

            px(x, y, c);
        }
    }

    m.detail({ px, kind, isFill, isPlatform, r, ink, accent, bandEnd, undersideTop,
               seed: m.seed, shade, mix, clump, hash });

    if (cap) paintCap(px, cap, r, ink, isPlatform);
}

/**
 * Turn a surface or platform tile into the END of a run.
 *
 * Applied AFTER the detail hook, so a world's own edge character is drawn first
 * and then cut -- otherwise a cap would be the one tile in the sheet with no
 * material identity. The outer columns go to ink for the same reason the top row
 * does: it is the silhouette that tells a player where the ledge stops, and a
 * ledge whose end is the same value as its middle has no end.
 */
function paintCap(px, side, r, ink, isPlatform) {
    const outer = x => (side === 'left' ? x : TILE - 1 - x);
    const floor = isPlatform ? TILE : TILE;
    for (let i = 0; i < CAP_EDGE; i++) {
        const x = outer(i);
        for (let y = 0; y < floor; y++) {
            // The very outside is ink; the column inside it is one ramp step
            // down, so the edge has a thickness rather than being a drawn line.
            px(x, y, i === 0 ? ink : mix(r.deep, ink, 0.45));
        }
    }
    // Cut the outer top corner away so the end reads as rounded rather than
    // sawn. Transparent, not dark: a dark notch looks like damage.
    for (let i = 0; i < CAP_BITE; i++) {
        for (let y = 0; y < CAP_BITE - i; y++) {
            px(outer(i), y, [0, 0, 0], 0);
        }
    }
}

/**
 * One small mark at the bottom of an otherwise transparent tile.
 *
 * These go in the decoration layer, one row above a surface, which is why every
 * mark is anchored to the bottom edge: it has to look like it is growing out of
 * the ground below rather than floating over it.
 */
function paintScatter(px, mark, r, ink, accent, seed) {
    for (let x = 0; x < TILE; x++) for (let y = 0; y < TILE; y++) px(x, y, [0, 0, 0], 0);

    const base = TILE - 1;
    if (mark === 'tuft') {
        // Three blades of different heights, leaning apart.
        const blades = [{ x: 12, h: 9, lean: -1 }, { x: 16, h: 13, lean: 0 }, { x: 20, h: 8, lean: 1 }];
        for (const b of blades) {
            for (let i = 0; i < b.h; i++) {
                const x = b.x + Math.round((i / b.h) * b.lean * 3);
                px(x, base - i, i > b.h - 3 ? accent : r.lit);
                px(x + 1, base - i, r.mid);
            }
        }
        return;
    }
    if (mark === 'stone') {
        // A squat rounded lump. Wider than tall so it reads as resting.
        const w = 11, h = 6;
        for (let dy = 0; dy < h; dy++) {
            const inset = Math.round((dy / h) ** 2 * 3);
            for (let dx = inset; dx < w - inset; dx++) {
                const x = 11 + dx;
                const y = base - (h - 1) + dy;
                px(x, y, dy === 0 ? r.hi : dy < h - 2 ? r.mid : r.deep);
            }
        }
        for (let dx = 0; dx < w; dx++) px(11 + dx, base, ink);
        return;
    }
    // sprout: a stem with one leaf either side.
    const stemX = 16;
    for (let i = 0; i < 11; i++) px(stemX, base - i, i > 7 ? accent : r.lit);
    for (let i = 0; i < 4; i++) {
        px(stemX - 1 - i, base - 5 - i, r.lit);
        px(stemX + 1 + i, base - 7 - i, r.lit);
    }
}

// ── per-world material detail ───────────────────────────────────────────────
/*
 * The rule that governs everything below, learned the hard way over three
 * iterations of this generator:
 *
 *   With one tile per role, texture must be NON-FIGURATIVE.
 *
 * The compiler places exactly one tile for each of surface, fill and platform,
 * so a ground run is that tile repeated across the whole screen. Any
 * recognisable mark becomes wallpaper. Earlier passes put pebbles, branching
 * crystal seams and stone cracks into the fields: at 30 repetitions the pebbles
 * printed as a lattice, the seams resolved into little stick figures, and the
 * cracks read as a scattered typeface.
 *
 * So, split by material class:
 *
 *   Organic  (Emberwood, Prism Hollow, Aurora Spire) - no marks in the field.
 *            Low-contrast value variation only, within one ramp step. All the
 *            character goes on the top edge, which is a single row rather than
 *            a field and therefore cannot tile into a pattern.
 *
 *   Machined (Sugarstorm, Geyserworks) - lean into the regularity. A boardwalk
 *            and a riveted plate are supposed to repeat, so an aligned grid
 *            reads as architecture instead of as an artefact.
 *
 * Distinctive one-off marks belong in decoration tiles. The compiler emits an
 * empty decoration layer and never populates it; see roadmap.md.
 */

const DETAIL = {
    /** Grass over earth. Character on the edge, nothing figurative below it. */
    emberwood: ({ px, isFill, isPlatform, r, bandEnd, seed }) => {
        if (!isFill) {
            for (let x = 0; x < TILE; x++) {
                if (clump(x, 0, 2, seed + 31) > 0.62) { px(x, 1, r.hi); px(x, 2, r.lit); }
            }
            // Blade tips breaking into the soil, on the boundary row only.
            for (let x = 0; x < TILE; x++) {
                if (hash(x, 3, seed + 41) > 0.82) {
                    const d = bandEnd + 1 + Math.floor(hash(x, 4, seed) * 3);
                    for (let y = bandEnd; y < d && y < 20; y++) px(x, y, r.lit);
                }
            }
        }
        // Soil: single-step value variation, no shapes. Reads as texture at 1x
        // and refuses to resolve into a motif when tiled.
        const from = isFill ? 0 : bandEnd + 5;
        const to = isPlatform ? 26 : TILE;
        for (let y = from; y < to; y++) {
            for (let x = 0; x < TILE; x++) {
                const n = clump(x, y, 2, seed + 61);
                if (n > 0.93) px(x, y, r.shadow);
                else if (n < 0.07) px(x, y, r.deeper);
            }
        }
    },

    /** Basalt. Facet value blocks in the field; the bright seam is a platform
     *  signature only, because a platform appears in short runs. */
    prism_hollow: ({ px, isFill, isPlatform, r, accent, bandEnd, seed }) => {
        const from = isFill ? 0 : bandEnd + 5;
        const to = isPlatform ? 26 : TILE;
        for (let y = from; y < to; y++) {
            for (let x = 0; x < TILE; x++) {
                const facet = clump(x, y, 8, seed + 71);
                const grain = clump(x, y, 2, seed + 73);
                if (facet > 0.66 && grain > 0.55) px(x, y, r.shadow);
                else if (facet < 0.3 && grain < 0.4) px(x, y, r.deeper);
            }
        }
        if (isPlatform) {
            for (let x = 0; x < TILE; x++) px(x, 1, accent);
            // One dim seam in the slab body. Short runs, so it stays a detail.
            let cx = 8;
            for (let y = 14; y < 25; y++) {
                px(cx, y, shade(accent, -0.5));
                if (hash(cx, y, seed) > 0.5) cx = (cx + 1) % TILE;
            }
        }
    },

    /** Boardwalk. Machined, so the grid is the point - but the planks have to
     *  read as planks: lit at the top, darkening down, hard seam between. */
    sugarstorm: ({ px, isFill, isPlatform, r, accent, bandEnd }) => {
        const PLANK = 8;

        // Scaffold frame. Drawn on the fill tile, and on the lower part of the
        // surface tile, so a ground column reads planks-then-frame with no
        // mottled band between the two.
        const scaffold = (yFrom) => {
            for (let y = yFrom; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, r.deeper);
            for (let i = 0; i < TILE; i++) {
                if (i >= yFrom) px(i, i, r.deep);
                if (TILE - 1 - i >= yFrom) px(i, TILE - 1 - i, r.deep);
            }
            for (const x of [3, 19]) {
                for (let y = yFrom; y < TILE; y++) { px(x, y, r.deep); px(x + 1, y, r.deeper); }
            }
        };

        if (isFill) {
            scaffold(0);
            return;
        }

        const bottom = isPlatform ? 26 : bandEnd + 2;
        for (let p = 0; p < TILE / PLANK; p++) {
            const x0 = p * PLANK;
            for (let x = x0; x < x0 + PLANK; x++) {
                for (let y = 1; y <= bottom; y++) {
                    if (x === x0) { px(x, y, r.deeper); continue; }   // seam
                    const t = (y - 1) / (bottom - 1);                 // lit -> shadow down the plank
                    px(x, y, mix(r.hi, r.mid, Math.min(1, t * 1.35)));
                }
            }
            px(x0 + 3, 3, r.shadow);                                  // nail heads
            px(x0 + 6, 3, r.shadow);
        }
        if (!isPlatform) {
            scaffold(bottom + 1);
        }
        if (isPlatform) {
            for (let x = 4; x < TILE; x += 8) {
                px(x, 23, accent); px(x + 1, 23, accent);
                px(x, 24, shade(accent, -0.4)); px(x + 1, 24, shade(accent, -0.4));
            }
        }
    },

    /** Riveted plate. Also machined, so the seam grid is intentional. */
    geyserworks: ({ px, isFill, isPlatform, r, accent, bandEnd, seed }) => {
        const rust = shade(accent, -0.4);

        if (!isFill) {
            // Brushed metal on the walking surface, so the top is not a flat slab.
            for (let x = 0; x < TILE; x++) {
                if (clump(x, 0, 4, seed + 3) > 0.55) px(x, 3, shade(r.hi, 0.15));
                if (clump(x, 0, 4, seed + 9) > 0.7) px(x, 5, r.mid);
            }
        }

        const seamY = isFill ? 12 : bandEnd + 6;
        for (let x = 0; x < TILE; x++) { px(x, seamY, r.deeper); px(x, seamY + 1, r.deep); }

        // Two rivets on the seam, not a lattice of them.
        for (const rx of [6, 22]) {
            px(rx, seamY - 2, r.lit); px(rx + 1, seamY - 2, r.mid);
            px(rx, seamY - 1, r.deep); px(rx + 1, seamY - 1, r.deeper);
            for (let k = 2; k < 6; k++) {
                const y = seamY + k;
                if (y >= (isPlatform ? 26 : TILE - 1)) break;
                if (hash(rx, y, seed) > 0.5) px(rx, y, rust);
            }
        }
        if (isPlatform) for (let x = 0; x < TILE; x++) px(x, 26, r.deeper);
    },

    /** Weathered stone. Turf on the lip; the field stays non-figurative. */
    aurora_spire: ({ px, isFill, isPlatform, r, accent, bandEnd, seed }) => {
        if (!isFill) {
            for (let x = 0; x < TILE; x++) {
                const depth = 2 + Math.floor(clump(x, 0, 2, seed + 13) * 3);
                px(x, 1, shade(accent, 0.05));
                for (let y = 2; y <= depth; y++) px(x, y, shade(accent, -0.34));
                if (clump(x, 0, 2, seed + 29) > 0.7) px(x, depth + 1, shade(accent, -0.55));
            }
        }
        const from = isFill ? 0 : bandEnd + 5;
        const to = isPlatform ? 26 : TILE;
        for (let y = from; y < to; y++) {
            for (let x = 0; x < TILE; x++) {
                const block = clump(x, y, 8, seed + 81);
                const grain = clump(x, y, 2, seed + 83);
                if (block > 0.7 && grain > 0.6) px(x, y, r.shadow);
                else if (block < 0.28 && grain < 0.45) px(x, y, r.deep);
            }
        }
        if (isPlatform) for (let x = 0; x < TILE; x++) px(x, 26, r.deep);
    },
};

// ── worlds ──────────────────────────────────────────────────────────────────

const WORLDS = [
    { id: 'emberwood',    boundary: 'ragged',   seed: 11 },
    { id: 'prism_hollow', boundary: 'stepped',  seed: 23 },
    { id: 'sugarstorm',   boundary: 'straight', seed: 37 },
    { id: 'geyserworks',  boundary: 'straight', seed: 53 },
    { id: 'aurora_spire', boundary: 'ragged',   seed: 71 },
];

/*
 * The sheet is 4x4 and only three cells had anything in them, so a ground run
 * was one tile repeated and a three-wide ledge had no left or right end -- it
 * read as a slab cut out of nothing. Caps and scatter fill the rest.
 *
 * `cap` is the side the tile ends on: the outer three columns lose their lit
 * band to ink and the top outer corner is cut away, so a run terminates instead
 * of stopping. It is the same art otherwise, which is the point -- a cap is an
 * edge, not a different material.
 *
 * `scatter` tiles are transparent except for one small mark at the BOTTOM of the
 * cell, because the compiler places them on the row ABOVE a surface: the mark
 * has to sit on the ground it decorates. These are the one place a figurative
 * mark is safe, because they are placed sparsely and never in a run.
 */
const ROLES = [
    { index: 0, role: 'ground_surface',     kind: 'surface',  collides: true },
    { index: 1, role: 'ground_fill',        kind: 'fill',     collides: true },
    { index: 2, role: 'platform',           kind: 'platform', collides: true },
    { index: 3, role: 'ground_cap_left',    kind: 'surface',  collides: true,  cap: 'left' },
    { index: 4, role: 'ground_cap_right',   kind: 'surface',  collides: true,  cap: 'right' },
    { index: 5, role: 'platform_cap_left',  kind: 'platform', collides: true,  cap: 'left' },
    { index: 6, role: 'platform_cap_right', kind: 'platform', collides: true,  cap: 'right' },
    { index: 7, role: 'scatter_tuft',       kind: 'scatter',  collides: false, mark: 'tuft' },
    { index: 8, role: 'scatter_stone',      kind: 'scatter',  collides: false, mark: 'stone' },
    { index: 9, role: 'scatter_sprout',     kind: 'scatter',  collides: false, mark: 'sprout' },
];

/** How wide a cap's inked edge is, and how much of its outer corner is cut. */
const CAP_EDGE = 3;
const CAP_BITE = 4;

async function build() {
    const manifest = {
        $comment: 'Live tileset contract. Grid geometry is fixed by tools/level_compiler.ts: '
            + 'a 4x4 sheet of 32px tiles. Indices 0-2 are the surface, fill and platform; '
            + '3-6 are the left/right end caps of a ground or platform run; 7-9 are '
            + 'transparent scatter marks for the decoration layer. '
            + 'Replace a PNG in place to reskin a world; add an entry here plus a PNG to add one. '
            + 'BootScene loads every entry, so neither needs a code change. Generated entries come '
            + 'from tools/gen_tilesets.mjs - edit that, not this file. See brand/ASSET_MANIFEST.md.',
        tileWidth: TILE,
        tileHeight: TILE,
        columns: COLS,
        rows: ROWS,
        tilesets: [],
    };

    for (const w of WORLDS) {
        const palette = JSON.parse(
            await readFile(`godot/data/themes/theme_${w.id}.json`, 'utf8')).palette;

        const material = {
            ramp: ramp(palette.ground_lit, palette.ground_shadow),
            ink: palette.ink_world,
            accent: palette.accent,
            boundary: w.boundary,
            seed: w.seed,
            detail: DETAIL[w.id],
        };

        const sheet = new Sheet();
        for (const role of ROLES) {
            paintTile(sheet, role.index, material, role.kind, role.cap ?? null, role.mark ?? null);
        }

        const png = await sheet.toPng();
        for (const dir of OUT_DIRS) {
            if (!existsSync(dir)) await mkdir(dir, { recursive: true });
            await writeFile(`${dir}/${w.id}_tiles.png`, png);
        }

        manifest.tilesets.push({
            key: `${w.id}_tiles`,
            theme: w.id,
            image: `assets/tilesets/${w.id}_tiles.png`,
            source: 'generated',
            tiles: ROLES.map(({ index, role, collides }) => ({ index, role, collides })),
        });
        console.log(`  ${w.id}_tiles.png  ${png.length} bytes`);
    }

    // Authored tilesets the generator does not produce. They belong in the
    // manifest anyway, or BootScene ends up with two ways to load a tileset.
    const GRID_ROLES = ROLES.map(({ index, role, collides }) => ({ index, role, collides }));

    manifest.tilesets.push({
        key: 'forest_tiles',
        theme: 'forest',
        image: 'assets/tilesets/forest_tiles.png',
        source: 'authored',
        note: 'Base ground skin. Every level .tscn instances it through resources/tilesets/forest_tiles.tres; the per-world sheets dress over it.',
        tiles: GRID_ROLES,
    });
    manifest.tilesets.push({
        key: 'spike_hazards',
        theme: null,
        image: 'assets/tilesets/spike_hazards.png',
        source: 'authored',
        note: 'Variable-width hazard frames, sliced in BootScene. Not a 32px grid.',
        tiles: [],
    });

    return manifest;
}

const manifest = await build();
const serialized = JSON.stringify(manifest, null, 4) + '\n';

if (process.argv.includes('--check')) {
    const current = existsSync(MANIFEST) ? await readFile(MANIFEST, 'utf8') : '';
    if (current !== serialized) {
        console.error(`\n${MANIFEST} is stale. Run: node tools/gen_tilesets.mjs`);
        process.exit(1);
    }
    console.log('\ntileset manifest is current');
} else {
    await writeFile(MANIFEST, serialized);
    console.log(`\nwrote ${MANIFEST}`);
}
