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
 * Rec. 709 luminance, 0..1. Not a perceptual space - it only has to order and
 * separate the three bands, and it does that with one multiply per channel.
 */
const lum = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

/**
 * Move a colour to an exact luminance by mixing toward white or black, which
 * keeps its hue while it travels. Luminance is linear under a mix, so the
 * fraction that lands on the target is a closed form rather than a search.
 */
function setLuminance(c, target) {
    const have = lum(c);
    if (target > have) return mix(c, [255, 255, 255], have >= 1 ? 0 : (target - have) / (1 - have));
    return mix(c, [0, 0, 0], have <= 0 ? 0 : (have - target) / have);
}


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
    const { baseline, amplitude, peaks, rimLift, shade, haze, lightness } = opts;
    // Two separate jobs, and conflating them is what made half the worlds
    // unreadable. `haze` is hue only: distance washes a mountain toward the
    // colour of the air in front of it. `lightness` is the absolute value the
    // band has to land on, measured against the sky at the horizon.
    colour = setLuminance(mix(colour, sky, haze), lightness);
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
//
// All three bands come from ONE hue - the world's `mid` role - and are separated
// by a forced lightness ramp rather than by picking three palette entries.
//
// Picking three was the first attempt and it does not work: the roles are named
// for the tileset's depth, not for brightness, so in Sugarstorm `mid` is a hot
// magenta and `far` is a darker purple. Hazing them still left the middle range
// the loudest thing on screen, reading as *in front of* the level.
//
// A *relative* ramp was the second attempt and it does not work either. Mixing
// each band a fixed fraction toward the sky assumes the mountain and the sky
// start far apart in value, and in half these worlds they do not: Geyserworks'
// `mid` is 0.28 against a 0.20 sky, Aurora Spire's is 0.29 against 0.28. The
// bands came out the same brown or the same navy as the air behind them and the
// whole frame read as one mush. The ramp below is absolute - each band is
// pushed to an exact luminance derived from this world's own horizon - so the
// separation is the same in every world by construction.
//
// `haze` survives, but only as hue: distance washes a mountain toward the
// colour of the air in front of it. Amplitudes stay low toward the viewer - a
// spiky near range punches past the platforms and becomes foreground clutter.
const BANDS = [
    { file: 'far',  baseline: H * 0.30, amplitude: 11, peaks: 2, rimLift: 0.22, shade: 0.18, haze: 0.66, step: 0, seed: 11 },
    { file: 'mid',  baseline: H * 0.52, amplitude: 12, peaks: 3, rimLift: 0.16, shade: 0.24, haze: 0.44, step: 1, seed: 29 },
    { file: 'near', baseline: H * 0.72, amplitude: 11, peaks: 5, rimLift: 0.12, shade: 0.30, haze: 0.22, step: 2, seed: 47 },
];

// How far the far range sits from the sky at the horizon, and how much darker
// each range is than the one behind it.
const FAR_OFFSET = 0.16;
const BAND_STEP = 0.11;
// A band at 0.0 is a black hole in the frame and one at 1.0 is a white one;
// both lose the world's hue entirely.
const FLOOR = 0.05;
const CEILING = 0.82;

/**
 * The absolute luminance each band lands on, for one world.
 *
 * Only the far range is ever seen against the sky, so only it is placed
 * relative to the sky: lighter than a dark horizon (the classic night skyline,
 * where the glow is at the bottom), darker than a bright one (a daylit ridge
 * against open sky). Everything after it steps down from there, because mid is
 * read against far and near against mid - never against the air.
 */
function ramp(sky) {
    const horizon = lum(sky);
    const far = horizon + (horizon > 0.45 ? -FAR_OFFSET : FAR_OFFSET);
    return BANDS.map((b) => Math.min(CEILING, Math.max(FLOOR, far - b.step * BAND_STEP)));
}

const themes = readdirSync('godot/data/themes').filter((f) => f.endsWith('.json'));
console.log(`parallax ranges (${W * SCALE}x${H * SCALE}, nearest-upscaled from ${W}x${H}):`);
for (const file of themes) {
    const theme = JSON.parse(await readFile(`godot/data/themes/${file}`, 'utf8'));
    const id = theme.id;
    const sky = hex(theme.palette.sky_bottom);
    const lightness = ramp(sky);
    for (const [i, band] of BANDS.entries()) {
        const colour = hex(theme.palette.mid);
        // Each world gets its own seeds, so no two ranges share a skyline.
        const seed = band.seed * 131 + [...id].reduce((a, ch) => a + ch.charCodeAt(0), 0);
        await write(layer(colour, sky, seed, { ...band, lightness: lightness[i] }), `godot/assets/parallax/${id}_${band.file}.png`);
    }
    console.log(`  ${id.padEnd(14)} sky ${lum(sky).toFixed(2)} -> ${lightness.map((v) => v.toFixed(2)).join(' / ')}`);
}
