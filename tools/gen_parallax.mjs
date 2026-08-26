/**
 * Pixel-art mountain ranges, one set per world, from each theme's own palette.
 *
 * The sky was two gradient stops and nothing else, so every world was a
 * coloured void behind the platforms. brand/ASSET_MANIFEST.md Priority 1 has
 * reserved `far` / `mid` / `deep` for exactly this since the palettes were
 * written and nothing had ever read them.
 *
 * Authored at a quarter scale and upscaled with nearest-neighbour, which is the
 * only way to get real pixel art rather than a smooth vector shape that happens
 * to be in a PNG: every edge lands on a 4px block, matching the 32px world tiles.
 *
 * Tileable on x by construction - the height at x=0 equals the height at the
 * right edge - so a ParallaxLayer can repeat one strip forever.
 *
 * Run: node tools/gen_parallax.mjs
 */
import sharp from 'sharp';
import { readFile, mkdir } from 'fs/promises';
import { readdirSync } from 'fs';

const SCALE = 4;                    // authored pixel -> screen pixel
const W = 960 / SCALE;              // 240 authored columns, one screen wide
// Tall enough that the far ridge sits in the middle third of the frame rather
// than hugging the platform line, which left two thirds of the sky empty and
// was most of what made the background read as "just purple".
const H = 560 / SCALE;              // 140 authored rows

const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/**
 * Deterministic value noise. Math.random() would give a different mountain on
 * every run, so a regenerated asset would show up as a diff with no change in
 * intent - and nobody could reproduce a range they liked.
 */
function rng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

/**
 * A ridge line across the strip: summed sines at falling amplitudes, with the
 * phase chosen so the first and last column match and the strip tiles.
 */
function ridge(seed, baseline, amplitude, peaks) {
    const rand = rng(seed);
    const waves = [];
    for (let i = 0; i < 4; i++) {
        waves.push({
            // Whole numbers of cycles across the strip: the seam is the point.
            cycles: peaks * (i + 1),
            amp: amplitude / (i + 1.35),
            phase: rand() * Math.PI * 2,
        });
    }
    const line = [];
    for (let x = 0; x < W; x++) {
        const t = x / W;
        let y = baseline;
        for (const w of waves) y -= Math.sin(t * Math.PI * 2 * w.cycles + w.phase) * w.amp;
        line.push(y);
    }
    return line;
}

/**
 * One layer: a filled silhouette under its ridge, with a lit rim along the top
 * edge and a little vertical shading toward the base so it reads as mass rather
 * than as a flat cut-out.
 */
function layer(colour, sky, seed, opts) {
    const { baseline, amplitude, peaks, rimLift, shade, haze, darken } = opts;
    // Distance drains colour toward the sky; nearness adds weight.
    colour = mix(mix(colour, sky, haze), [0, 0, 0], darken);
    const buf = Buffer.alloc(W * H * 4, 0);
    const line = ridge(seed, baseline, amplitude, peaks);
    const rim = mix(colour, [255, 255, 255], rimLift);
    const base = mix(colour, [0, 0, 0], shade);

    for (let x = 0; x < W; x++) {
        const top = Math.round(line[x]);
        for (let y = Math.max(0, top); y < H; y++) {
            // Depth below the ridge, so the mass darkens as it goes down.
            const depth = Math.min(1, (y - top) / 26);
            let c = mix(colour, base, depth);
            // A two-pixel lit edge along the crest: the light in every world
            // comes from above (§5.4), so the top of a mass catches it.
            if (y - top < 2) c = rim;
            const i = (y * W + x) * 4;
            buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;
        }
    }
    return buf;
}

async function write(buf, path) {
    await mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
    await sharp(buf, { raw: { width: W, height: H, channels: 4 } })
        .resize(W * SCALE, H * SCALE, { kernel: 'nearest' })
        .png().toFile(path);
}

// Far is highest, palest and flattest; near is lowest, darkest and sharpest.
// That ordering is what makes the three read as distance rather than as three
// mountain ranges that happen to overlap.
// `haze` is the fraction of the sky colour mixed into the band.
//
// This is what makes three ranges read as distance rather than as one mass:
// air between you and a mountain washes it toward the colour of the sky, and
// without it the far range came out exactly as loud as the platforms the crow
// is standing on. The near band gets almost none - it is nearly in the level.
//
// Amplitudes fall toward the viewer for the same reason the first version
// looked wrong: a spiky near range punched up past the platforms and read as
// foreground clutter instead of as background.
// All three bands come from ONE hue - the world's `mid` role - and are separated
// by a forced lightness ramp rather than by picking three palette entries.
//
// Picking three was the first attempt and it does not work: the roles are named
// for the tileset's depth, not for brightness, so in Sugarstorm `mid` is a hot
// magenta and `far` is a darker purple. Hazing them still left the middle range
// the loudest thing on screen, reading as *in front of* the level. A ramp is
// correct in every world by construction.
//
// `haze` washes toward the sky (aerial perspective, so distance drains colour);
// `darken` pulls toward black (so nearer mass is heavier). Amplitudes stay low
// toward the viewer - a spiky near range punches past the platforms and becomes
// foreground clutter.
const BANDS = [
    { file: 'far',  baseline: H * 0.30, amplitude: 11, peaks: 2, rimLift: 0.22, shade: 0.18, haze: 0.66, darken: 0.00, seed: 11 },
    { file: 'mid',  baseline: H * 0.52, amplitude: 12, peaks: 3, rimLift: 0.16, shade: 0.24, haze: 0.44, darken: 0.20, seed: 29 },
    { file: 'near', baseline: H * 0.72, amplitude: 11, peaks: 5, rimLift: 0.12, shade: 0.30, haze: 0.22, darken: 0.42, seed: 47 },
];

const themes = readdirSync('godot/data/themes').filter((f) => f.endsWith('.json'));
console.log('parallax ranges (960x420, nearest-upscaled from 240x105):');
for (const file of themes) {
    const theme = JSON.parse(await readFile(`godot/data/themes/${file}`, 'utf8'));
    const id = theme.id;
    for (const band of BANDS) {
        const colour = hex(theme.palette.mid);
        const sky = hex(theme.palette.sky_bottom);
        // Each world gets its own seeds, so no two ranges share a skyline.
        const seed = band.seed * 131 + [...id].reduce((a, ch) => a + ch.charCodeAt(0), 0);
        await write(layer(colour, sky, seed, band), `godot/assets/parallax/${id}_${band.file}.png`);
    }
    console.log(`  ${id.padEnd(14)} far/mid/near`);
}
