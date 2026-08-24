import Phaser from 'phaser';
import type { Locale } from '../../systems/TextManager';

/**
 * Flag icons for the language selector, drawn as vector geometry.
 *
 * WHY NOT EMOJI
 * -------------
 * 🇮🇸 and 🇺🇸 look like the obvious answer and are the same trap this whole
 * localisation pass started with. A flag emoji is a pair of regional-indicator
 * code points (U+1F1EE U+1F1F8) far outside Latin-1, and whether it becomes a
 * flag depends entirely on the font:
 *
 *   - Windows ships no flag glyphs at all. Chrome on Windows renders the pair
 *     as the letters "IS" and "US" instead of a flag -- so the icon silently
 *     turns back into text on the most common desktop platform.
 *   - The Godot export bundles one font with no emoji coverage, so there the
 *     pair is two missing-glyph boxes. That is precisely the tofu that started
 *     this work.
 *   - tools/validate_i18n.mjs enforces a Latin-1 allowlist on the bundles for
 *     exactly this reason, and would reject them anyway.
 *
 * So the flags are drawn, like the PIN dots and the selected-state tick before
 * them. Eight fills and a few dots each, identical on every platform, and no
 * font involved.
 *
 * The geometry is mirrored in godot/scripts/ui/flag_icon.gd. Keep the two in
 * step; godot/tests/test_flag_icon.gd checks the shared proportions.
 */

/** Official-ish flag colours, as Phaser colour numbers. */
const IS_BLUE = 0x02529c;
const IS_RED = 0xdc1e35;
const US_RED = 0xb22234;
const US_BLUE = 0x3c3b6e;
const WHITE = 0xffffff;

/**
 * Nordic cross proportions, as fractions.
 *
 * Thicknesses are relative to HEIGHT (that is how a Nordic cross is specified,
 * so the arms stay square) and the vertical arm sits toward the hoist rather
 * than centred -- that offset is the thing that makes it read as Icelandic and
 * not as a plus sign.
 */
const CROSS_WHITE_T = 0.24;
const CROSS_RED_T = 0.12;
const CROSS_VERTICAL_CX = 0.36;

/**
 * Stripe count for the US flag.
 *
 * The real flag has 13. At the 15px height this renders at, 13 stripes are
 * 1.15px each -- below a pixel once antialiasing is done with them, so they
 * blur into flat pink. Seven stripes are 2.1px each, still start and end red
 * like the real flag, and actually read as stripes. Legibility at the size it
 * is drawn beats a correct count nobody can see.
 */
const US_STRIPES = 7;
const US_CANTON_STRIPES = 4;
const US_CANTON_W = 0.42;

export function drawFlag(
    g: Phaser.GameObjects.Graphics,
    locale: Locale,
    x: number,
    y: number,
    w: number,
    h: number,
): void {
    if (locale === 'is') drawIceland(g, x, y, w, h);
    else drawUnitedStates(g, x, y, w, h);

    // A hairline border so a white stripe or the white cross does not bleed
    // into a light pill background.
    g.lineStyle(1, 0x000000, 0.35);
    g.strokeRect(x, y, w, h);
}

function drawIceland(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
    g.fillStyle(IS_BLUE, 1);
    g.fillRect(x, y, w, h);

    const cx = x + w * CROSS_VERTICAL_CX;
    const cy = y + h / 2;

    for (const [colour, t] of [[WHITE, CROSS_WHITE_T], [IS_RED, CROSS_RED_T]] as const) {
        const bar = h * t;
        g.fillStyle(colour, 1);
        g.fillRect(cx - bar / 2, y, bar, h);          // vertical arm
        g.fillRect(x, cy - bar / 2, w, bar);          // horizontal arm
    }
}

function drawUnitedStates(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
    const stripeH = h / US_STRIPES;

    g.fillStyle(WHITE, 1);
    g.fillRect(x, y, w, h);
    g.fillStyle(US_RED, 1);
    for (let i = 0; i < US_STRIPES; i += 2) {
        g.fillRect(x, y + i * stripeH, w, stripeH);
    }

    const cantonW = w * US_CANTON_W;
    const cantonH = stripeH * US_CANTON_STRIPES;
    g.fillStyle(US_BLUE, 1);
    g.fillRect(x, y, cantonW, cantonH);

    // Stars as a 3x2 grid of dots. At this size individual points are all that
    // survives; the grid is what says "stars" rather than "plain blue".
    g.fillStyle(WHITE, 1);
    const dot = Math.max(0.9, cantonH * 0.09);
    for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 3; col++) {
            g.fillCircle(
                x + cantonW * (0.26 + col * 0.24),
                y + cantonH * (0.32 + row * 0.36),
                dot,
            );
        }
    }
}
