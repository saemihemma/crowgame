/**
 * Placeholder art for every slot the game looks for and nothing fills.
 *
 * These are not concept art and they are not trying to be. Each one is drawn
 * from the Fixed Nine (brand/BRAND_SYSTEM.md §6) at the exact pixel size the
 * code loads, so the game shows a real texture in a real slot and the layout
 * around it can be judged. Replacing one is dropping a file over it.
 *
 * They are deliberately plain: an artist should be able to tell at a glance
 * which pixels are placeholder and which are shipped work. Nothing here has
 * rendering, gradients or lighting - flat fills, hard edges, one accent.
 *
 * Run: node tools/gen_placeholder_art.mjs
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'fs/promises';
import { dirname } from 'path';

// brand/BRAND_SYSTEM.md §6 — the Fixed Nine.
const INK = [0x1a, 0x14, 0x20];
const PAPER = [0xff, 0xf8, 0xe7];
const COIN = [0xff, 0xc9, 0x3c];
const OWL = [0xff, 0xe9, 0xa8];
const HERO = [0xe2, 0x3b, 0x3b];

/** A raw RGBA canvas that draws in whole pixels, because this is pixel art. */
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
    outline(x, y, w, h, c, t = 1) {
        for (let k = 0; k < t; k++) {
            this.rect(x + k, y + k, w - k * 2, 1, c);
            this.rect(x + k, y + h - 1 - k, w - k * 2, 1, c);
            this.rect(x + k, y + k, 1, h - k * 2, c);
            this.rect(x + w - 1 - k, y + k, 1, h - k * 2, c);
        }
    }
    /** Filled circle, drawn by distance so it stays round at small sizes. */
    disc(cx, cy, r, c, a = 255) {
        for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
            for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
                if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.set(x, y, c, a);
    }
    ring(cx, cy, r, t, c) {
        for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
            for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
                const d = Math.hypot(x - cx, y - cy);
                if (d <= r && d >= r - t) this.set(x, y, c);
            }
    }
    async write(path) {
        await mkdir(dirname(path), { recursive: true });
        await sharp(this.buf, { raw: { width: this.w, height: this.h, channels: 4 } })
            .png().toFile(path);
        console.log(`  ${path.padEnd(58)} ${this.w}x${this.h}`);
    }
}

/** 32x32 owl head for the HUD ring and the maths board header. */
function owlIcon() {
    const c = new Canvas(32, 32);
    c.disc(16, 17, 11, OWL);              // head
    c.ring(16, 17, 11, 2, INK);
    // Ear tufts: the one feature that says "owl" and not "bird" in a silhouette.
    for (let i = 0; i < 5; i++) {
        c.rect(7 + i, 8 - i, 2, 2 + i, OWL);
        c.rect(23 - i, 8 - i, 2, 2 + i, OWL);
    }
    c.disc(12, 16, 3.4, PAPER); c.disc(20, 16, 3.4, PAPER);   // eye discs
    c.disc(12, 16, 1.6, INK);   c.disc(20, 16, 1.6, INK);     // pupils
    c.rect(15, 19, 2, 3, INK);                                 // beak
    return c;
}

/*
 * There was a countToken() here and it is deliberately gone.
 *
 * It drew a disc with a cross notch through it, which rendered as a PLUS SIGN
 * INSIDE A CIRCLE -- and every one of the 123 counting problems drew that same
 * token, so the twelve-way symbol variety the curriculum encodes was thrown away
 * one layer before the child, and what they were handed to count was the
 * addition operator. A playtester reported both halves of that in one sentence.
 *
 * Counting tokens are now six drawn shapes in scripts/ui/components/count_row.gd,
 * picked from the prompt's own symbol and coloured from the live theme, which a
 * static PNG cannot be. Per-shape art is still optional and still welcome: see
 * godot/assets/sprites/ui/board/README.md for the keys. Do not regenerate one
 * token for all of them.
 */

/**
 * 96x96 nine-slice board. The 24px corners are what the inset in
 * ui_tuning.json (math_challenge.board_texture_inset) refers to, so the middle
 * 48x48 is what stretches.
 */
function boardNineSlice() {
    const c = new Canvas(96, 96);
    c.rect(0, 0, 96, 96, [0x4a, 0x33, 0x22]);       // board face
    c.outline(0, 0, 96, 96, INK, 4);                 // frame
    c.outline(4, 4, 88, 88, [0x6b, 0x4a, 0x2e], 2);  // inner bevel
    // Corner studs, inside the 24px margin so stretching never distorts them.
    for (const [x, y] of [[10, 10], [80, 10], [10, 80], [80, 80]]) {
        c.disc(x, y, 4, COIN);
        c.ring(x, y, 4, 1, INK);
    }
    return c;
}

/**
 * 32x32 chain link. brand/BRAND_SYSTEM.md §3.4a: one drawn per chainLinks, so a
 * child can count an owl's difficulty from across the screen before deciding to
 * walk over. Drawn as an open oval so a row of them reads as a chain.
 */
function chainLink() {
    const c = new Canvas(32, 32);
    for (let y = 0; y < 32; y++)
        for (let x = 0; x < 32; x++) {
            // Oval ring: taller than wide, so links stack into a chain.
            const d = ((x - 16) / 9) ** 2 + ((y - 16) / 14) ** 2;
            if (d <= 1 && d >= 0.36) c.set(x, y, [0x9a, 0x9f, 0xad]);
        }
    for (let y = 0; y < 32; y++)
        for (let x = 0; x < 32; x++) {
            const d = ((x - 16) / 9) ** 2 + ((y - 16) / 14) ** 2;
            if (d <= 1.16 && d >= 0.98) c.set(x, y, INK);
            if (d <= 0.38 && d >= 0.30) c.set(x, y, INK);
        }
    c.rect(12, 6, 3, 3, PAPER, 150);   // one highlight, so it reads as metal
    return c;
}

/** A link mid-burst, for the beat where an answer breaks one. */
function chainLinkBurst() {
    const c = new Canvas(32, 32);
    for (const [x, y, r] of [[9, 9, 3], [23, 8, 2], [8, 22, 2], [24, 23, 3], [16, 5, 2], [16, 27, 2]]) {
        c.disc(x, y, r, [0x9a, 0x9f, 0xad]);
        c.ring(x, y, r, 1, INK);
    }
    c.disc(16, 16, 2, COIN);
    return c;
}

await mkdir('godot/assets/sprites/ui/hud', { recursive: true });
console.log('placeholder art (Fixed Nine, exact runtime sizes):');
await owlIcon().write('godot/assets/sprites/ui/hud/owl-icon-32.png');
await boardNineSlice().write('godot/assets/sprites/ui/board/board-9slice.png');
await chainLink().write('godot/assets/sprites/objects/chain/chain-link-32.png');
await chainLinkBurst().write('godot/assets/sprites/objects/chain/chain-link-burst-32.png');
