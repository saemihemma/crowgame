#!/usr/bin/env node
/**
 * i18n guard — fails the build on the four ways localisation silently rots.
 *
 * 1. GLYPH ALLOWLIST. Rendered code and string bundles may only use ASCII plus
 *    the Latin-1 letters Icelandic needs. This exists because the login PIN
 *    dots were the characters U+25CF / U+25CB, which live in the Unicode
 *    "Geometric Shapes" block that Godot's built-in font does not carry -- so
 *    they rendered as missing-glyph boxes printing their own hex codepoint. The
 *    locked-level padlock was the emoji U+1F512, one screen away from the same
 *    fate. UI primitives belong in Graphics/Line2D, not in a font.
 *
 * 2. BUNDLE PARITY. Web and Godot each keep their own copy of the bundles.
 *    They must stay identical; nothing else enforces it.
 *
 * 3. LOCKSTEP + PLACEHOLDERS. Every locale carries every key, with matching
 *    {0}/{1} placeholders, so a locale can never serve a half-substituted
 *    string.
 *
 * 4. FIT BUDGET. The layout is hard-coded pixels and Icelandic is a longer
 *    language. Every string that lands in a constrained box is measured against
 *    that box, so a translation cannot silently clip.
 *
 * Run: node tools/validate_i18n.mjs
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE_DIRS = ['public/data/i18n', 'godot/data/i18n'];
const LOCALES = ['en', 'is'];
const FALLBACK_LOCALE = 'en';

/** Directories whose contents get rendered to a player. */
const RENDERED_CODE = ['src', 'godot/scripts'];
const RENDERED_EXTENSIONS = ['.ts', '.gd'];

/**
 * The rule: Latin-1 or below.
 *
 * Every letter Icelandic needs -- a e i o u with acute, ae, eth, thorn, o with
 * diaeresis and their capitals -- lives in Latin-1 Supplement, and so do the
 * maths and punctuation symbols the game already uses. Latin-1 has universal
 * font coverage, Godot's built-in font included, so nothing in that range can
 * tofu. Everything above it is opt-in, one character at a time, with a reason.
 */
const MAX_SAFE_CODEPOINT = 0xff;
const ALLOWED_ABOVE_LATIN1 = new Set([
    // Nothing yet. Before adding a character here, ask whether it is really a
    // UI primitive that should be drawn with Graphics/Line2D instead -- the PIN
    // dots, the locked-level padlock and the dialog advance arrow all were.
]);

/**
 * Quoted strings in source: single, double and template. Only string literals
 * can reach a player, so comments (which are full of box-drawing decoration)
 * are deliberately out of scope.
 */
const STRING_LITERAL = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;

/**
 * Where each string lands. `max` is the usable width in CSS pixels at `size`.
 * Numbers come from reading the scene source; see the review for derivations.
 */
const BOXES = {
    'menu.title': { size: 72, max: 900, where: 'MainMenuScene title, centred on a 960 canvas' },
    'login.title': { size: 64, max: 900, where: 'LoginScene title, centred on a 960 canvas' },
    'menu.play': { size: 24, max: 240, where: 'MainMenuScene button 240x52' },
    'menu.continue': { size: 24, max: 240, where: 'MainMenuScene button 240x52' },
    'pause.title': { size: 32, max: 320, where: 'PauseScene panel 320 wide' },
    'pause.resume': { size: 24, max: 200, where: 'PauseScene button 200x48' },
    'pause.quit': { size: 24, max: 200, where: 'PauseScene button 200x48' },
    'pause.theme': { size: 24, max: 200, where: 'PauseScene button 200x48' },
    'login.new_user': { size: 26, max: 320, where: 'LoginScene button 320x64' },
    'login.back': { size: 26, max: 200, where: 'LoginScene button 200x52' },
    'login.go': { size: 26, max: 200, where: 'LoginScene button 200x56' },
    'login.name_placeholder': { size: 28, max: 280, where: 'LoginScene DOM input width 280' },
    'level_select.complete': { size: 16, max: 220, where: 'Level node, label to node edge' },
    'level_select.ready': { size: 16, max: 220, where: 'Level node' },
    'level_select.locked': { size: 16, max: 220, where: 'Level node' },
    'level.level_01.name': { size: 20, max: 240, where: 'Level node name, label start to padlock' },
    'level.level_02.name': { size: 20, max: 240, where: 'Level node name, label start to padlock' },
    'level.level_03.name': { size: 20, max: 240, where: 'Level node name, label start to padlock' },
    'level.level_04.name': { size: 20, max: 240, where: 'Level node name, label start to padlock' },
    'level.level_05.name': { size: 20, max: 240, where: 'Level node name, label start to padlock' },
    'level.level_99.name': { size: 20, max: 240, where: 'Level node name, label start to padlock' },
    'touch.jump': { size: 18, max: 76, where: 'Touch button 88x88 less padding' },
    'touch.peck': { size: 18, max: 76, where: 'Touch button 88x88 less padding' },
    'touch.zap': { size: 18, max: 76, where: 'Touch button 88x88 less padding' },
    'game.play_again': { size: 26, max: 280, where: 'Completion button' },
    'game.back_to_menu': { size: 26, max: 280, where: 'Completion button' },
    'boot.loading': { size: 20, max: 400, where: 'Boot loading bar' },
};

/**
 * Monospace advance as a fraction of the type size. DejaVu Sans Mono, Liberation
 * Mono and Consolas all sit at 0.60; 0.63 leaves headroom so a broader fallback
 * font on a player's device does not overflow a box that passed here.
 */
const ADVANCE_RATIO = 0.63;

const failures = [];
const fail = (msg) => failures.push(msg);

// ── load ───────────────────────────────────────────────────────────────────
const bundles = {};
for (const dir of BUNDLE_DIRS) {
    bundles[dir] = {};
    for (const locale of LOCALES) {
        const path = join(ROOT, dir, `strings_${locale}.json`);
        try {
            bundles[dir][locale] = JSON.parse(readFileSync(path, 'utf8'));
        } catch (err) {
            fail(`cannot read ${dir}/strings_${locale}.json: ${err.message}`);
            bundles[dir][locale] = {};
        }
    }
}

const [primaryDir, ...otherDirs] = BUNDLE_DIRS;

// ── 1. glyph allowlist ─────────────────────────────────────────────────────
/**
 * Resolve `\uXXXX` / `\u{XXXXX}` escapes to the character they denote.
 *
 * This matters more than it looks: the original PIN-dot bug was written as the
 * escape `'\u25CF'`, which is pure ASCII on disk. A guard that only looked at
 * raw characters would have waved the very bug it exists to catch straight
 * through.
 */
function decodeEscapes(text) {
    return text
        .replace(/\\u\{([0-9a-fA-F]{1,6})\}/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function checkGlyphs(label, rawText) {
    const text = decodeEscapes(rawText);
    const seen = new Set();
    for (const ch of text) {
        if (ch.codePointAt(0) <= MAX_SAFE_CODEPOINT || ALLOWED_ABOVE_LATIN1.has(ch)) continue;
        if (seen.has(ch)) continue;
        seen.add(ch);
        const hex = ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
        fail(`${label}: character ${JSON.stringify(ch)} (U+${hex}) is outside the glyph allowlist`);
    }
}

for (const dir of BUNDLE_DIRS) {
    for (const locale of LOCALES) {
        for (const [key, value] of Object.entries(bundles[dir][locale])) {
            checkGlyphs(`${dir}/strings_${locale}.json [${key}]`, value);
        }
    }
}

function walk(dir, out = []) {
    let entries;
    try {
        entries = readdirSync(dir);
    } catch {
        return out;
    }
    for (const entry of entries) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path, out);
        else if (RENDERED_EXTENSIONS.some(ext => path.endsWith(ext))) out.push(path);
    }
    return out;
}

for (const codeDir of RENDERED_CODE) {
    for (const path of walk(join(ROOT, codeDir))) {
        const rel = relative(ROOT, path);
        readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
            for (const literal of line.match(STRING_LITERAL) ?? []) {
                checkGlyphs(`${rel}:${i + 1}`, literal);
            }
        });
    }
}

// ── 2. bundle parity across targets ────────────────────────────────────────
for (const dir of otherDirs) {
    for (const locale of LOCALES) {
        const a = bundles[primaryDir][locale];
        const b = bundles[dir][locale];
        for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
            if (a[key] !== b[key]) {
                fail(
                    `strings_${locale}.json diverges between targets at [${key}]: ` +
                    `${primaryDir}=${JSON.stringify(a[key])} ${dir}=${JSON.stringify(b[key])}`,
                );
            }
        }
    }
}

// ── 3. lockstep + placeholder parity ───────────────────────────────────────
const reference = bundles[primaryDir][FALLBACK_LOCALE];
const placeholders = (value) =>
    [...String(value).matchAll(/\{(\d)\}/g)].map(m => m[1]).sort().join(',');

for (const locale of LOCALES) {
    if (locale === FALLBACK_LOCALE) continue;
    const target = bundles[primaryDir][locale];
    for (const key of Object.keys(reference)) {
        if (!(key in target)) fail(`strings_${locale}.json is missing key [${key}]`);
    }
    for (const key of Object.keys(target)) {
        if (!(key in reference)) fail(`strings_${locale}.json has key [${key}] not in ${FALLBACK_LOCALE}`);
    }
    for (const key of Object.keys(reference)) {
        if (!(key in target)) continue;
        if (placeholders(reference[key]) !== placeholders(target[key])) {
            fail(
                `placeholder mismatch at [${key}]: ` +
                `${FALLBACK_LOCALE}=${JSON.stringify(reference[key])} ${locale}=${JSON.stringify(target[key])}`,
            );
        }
    }
}

// ── 4. fit budget ──────────────────────────────────────────────────────────
let measured = 0;
for (const [key, box] of Object.entries(BOXES)) {
    for (const locale of LOCALES) {
        const value = bundles[primaryDir][locale][key];
        if (value === undefined) {
            fail(`fit budget names [${key}], which is missing from strings_${locale}.json`);
            continue;
        }
        // Substitute a two-digit stand-in for placeholders; counters rarely
        // exceed that and it keeps the check deterministic.
        const rendered = String(value).replace(/\{\d\}/g, '88');
        const width = rendered.length * box.size * ADVANCE_RATIO;
        measured++;
        if (width > box.max) {
            fail(
                `[${key}] ${locale.toUpperCase()} overflows its box by ${Math.ceil(width - box.max)}px ` +
                `(${Math.round(width)}px into ${box.max}px at ${box.size}px -- ${box.where}): ` +
                JSON.stringify(value),
            );
        }
    }
}

// ── report ─────────────────────────────────────────────────────────────────
if (failures.length === 0) {
    const keyCount = Object.keys(reference).length;
    console.log(
        `i18n guard: clean (${keyCount} keys x ${LOCALES.length} locales x ${BUNDLE_DIRS.length} targets, ` +
        `${measured} fit checks)`,
    );
    process.exit(0);
}

console.log(`i18n guard: ${failures.length} problem(s)`);
for (const f of failures) console.log(`  ${f}`);
process.exit(1);
