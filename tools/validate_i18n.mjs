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

import { TEMPLATES, format, render, verify, pluralKey, PLURAL_PARAM, PLURAL_RULES } from './math_phrasing_catalog.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MATH_POOLS = ['problems_easy', 'problems_dataset', 'problems_gaps', 'problems_curriculum'];
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
    // Measured with the real state words rather than the '88' stand-in: the
    // button renders "Hljóð: Slökkt", not "Hljóð: 88", and the placeholder
    // substitution below would otherwise report a comfortable fit for a string
    // twice that width. Godot draws this at 28px on a 240px button (pause.gd),
    // which is the tighter of the two, so measure that.
    'pause.sound': {
        size: 28, max: 240, where: 'Godot pause sound button 240x64 at 28px',
        fill: ['sound.on', 'sound.off'],
    },
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
    // Filled with a domain NAME, not a number, and centred on a 960 canvas at
    // 36px -- so "Næsta stig! Samanburður" is the string that has to fit, and the
    // '88' stand-in said nothing useful about it.
    'math.step_up': {
        size: 36, max: 900, where: 'HUDScene celebration banner, centred on a 960 canvas',
        fill: [
            'domain.addition', 'domain.subtraction', 'domain.multiplication',
            'domain.division', 'domain.counting', 'domain.comparison',
            'domain.pattern_matching', 'domain.number_sequence',
        ],
    },
    // The completion line carries two counters and a translated label.
    'game.completion_stats': { size: 24, max: 900, where: 'GameScene completion line' },
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

// ── 2b. no dead keys ───────────────────────────────────────────────────────
/**
 * Every key in the bundles must be reachable from code or from the pools.
 *
 * A bundle key nothing renders is a translation cost with no player benefit, and
 * it rots: `hud.level`, `hud.level_up`, `login.delete` and `login.delete_confirm`
 * sat translated in four files for the whole localisation pass without ever
 * appearing on screen.
 *
 * THE TRAP THIS CHECK HAS TO AVOID
 * -------------------------------
 * A naive "does the source mention this string" sweep DELETES LIVE STRINGS. Four
 * families of key are assembled at runtime and never appear as literals:
 *
 *   domain.*        HUDScene.ts:81   t(`domain.${data.domain}`)
 *                   hud.gd:80        TextManager.t("domain." + domain)
 *   level.*         LevelSelectScene.ts:226  `level.${level.key}.name`
 *                   level_select.gd:74       "level.%s.name" % key
 *   theme.*         pause.gd:37      "theme.%s" % id
 *   math.prompt.*   from each problem's `phrasing` reference, via tp()
 *   math.hint.*
 *   math.expl.*
 *
 * The eight `domain.*` maths terms look dead and are not. So the prefixes are
 * declared here, with the call site that justifies each one -- if you add a new
 * dynamically-built family, add it here or this check will tell you to delete
 * strings the game is using.
 */
const DYNAMIC_PREFIXES = [
    { prefix: 'domain.', built: 'HUDScene.ts / hud.gd, from a problem domain' },
    { prefix: 'level.', built: 'LevelSelectScene.ts / level_select.gd, from a level key' },
    { prefix: 'theme.', built: 'pause.gd, from the active theme id' },
    { prefix: 'math.prompt.', built: "each problem's phrasing reference" },
    { prefix: 'math.hint.', built: "each problem's phrasing reference" },
    { prefix: 'math.expl.', built: "each problem's phrasing reference" },
];

{
    const sources = RENDERED_CODE
        .flatMap(dir => walk(join(ROOT, dir)))
        .map(path => readFileSync(path, 'utf8'))
        .join('\n');

    const dead = Object.keys(bundles[primaryDir][FALLBACK_LOCALE]).filter(key => {
        if (DYNAMIC_PREFIXES.some(d => key.startsWith(d.prefix))) return false;
        return !sources.includes(key);
    });

    for (const key of dead) {
        fail(
            `[${key}] is in the bundles but nothing renders it. Either wire it up, or `
            + `delete it from all ${BUNDLE_DIRS.length * LOCALES.length} bundle files. `
            + `If it is built at runtime rather than written as a literal, add its prefix `
            + `to DYNAMIC_PREFIXES in tools/validate_i18n.mjs`,
        );
    }
}

// ── 3. lockstep + placeholder parity ───────────────────────────────────────
const reference = bundles[primaryDir][FALLBACK_LOCALE];

/**
 * The SET of placeholder names in a string -- both positional ({0}, {1}) and
 * named ({a}, {op}, {sum}).
 *
 * This used to match /\{(\d)\}/ only, which meant every named placeholder in
 * the 168 math phrasing templates was invisible to it: an Icelandic template
 * could reference {sumx} where the English had {sum} and nothing would notice
 * until a child saw a literal "{sumx}" on the board.
 *
 * A SET, not a list, because a translation may legitimately use a placeholder
 * more than once where English uses it once. "Count by {step}s!" has no compact
 * Icelandic form with a numeral; the idiom repeats it -- "Teldu {step} og
 * {step}!" -- and that is correct, not a mismatch.
 */
const placeholders = (value) =>
    [...new Set([...String(value).matchAll(/\{([a-z0-9][a-z0-9]*)\}/g)].map(m => m[1]))]
        .sort().join(',');

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
        // exceed that and it keeps the check deterministic. A box may instead
        // name the keys that actually fill it (`fill`), in which case the widest
        // of those is used -- a stand-in is meaningless when the real
        // substitution is a word.
        const fillers = box.fill
            ? box.fill.map(k => bundles[primaryDir][locale][k] ?? k)
            : ['88'];
        const widest = fillers.reduce((a, b) => (String(b).length >= String(a).length ? b : a));
        const rendered = String(value).replace(/\{\d\}/g, String(widest));
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

// ── 5. math phrasing: the English bundle must equal the catalog ────────────
// tools/math_phrasing_catalog.mjs is what the derivation parses against and
// round-trips through. If the bundle's English drifted from it, the derivation
// would keep passing while the game rendered something else, so the two are
// generated from one source and checked here.
for (const [key, english] of Object.entries(TEMPLATES)) {
    for (const dir of BUNDLE_DIRS) {
        const actual = bundles[dir][FALLBACK_LOCALE][key];
        if (actual === undefined) {
            fail(`${dir}/strings_en.json is missing phrasing template [${key}] — run node tools/sync_math_phrasing_bundles.mjs`);
        } else if (actual !== english) {
            fail(
                `${dir}/strings_en.json has drifted from math_phrasing_catalog.mjs at [${key}]: `
                + `bundle=${JSON.stringify(actual)} catalog=${JSON.stringify(english)} `
                + `— run node tools/sync_math_phrasing_bundles.mjs`,
            );
        }
    }
}

// ── 5b. every plural-sensitive key has a `.one` form in every locale ──────
// A locale that names no `.one` variant would silently render the plural at 1.
// The base key is the 'other' form, so only `.one` needs declaring.
for (const key of Object.keys(PLURAL_PARAM)) {
    for (const locale of LOCALES) {
        if (bundles[primaryDir][locale][`${key}.one`] === undefined) {
            fail(
                `strings_${locale}.json has no [${key}.one], so it would render the plural form `
                + `at a value that takes the singular (${locale === 'is'
                    ? '1, 21, 31, ... in Icelandic' : '1 in English'})`,
            );
        }
    }
    // Sanity-check the rules themselves rather than trusting the comments.
    if (PLURAL_RULES.is(21) !== 'one' || PLURAL_RULES.is(11) !== 'other'
        || PLURAL_RULES.en(21) !== 'other' || PLURAL_RULES.en(1) !== 'one') {
        fail('the plural rules in math_phrasing_catalog.mjs no longer match the languages they describe');
        break;
    }
}

// ── 6. math phrasing: every derivation still round-trips and verifies ──────
// The pools carry a `phrasing` sibling per problem, derived by
// tools/derive_math_phrasing.mjs. Re-checking it here means a hand edit to a
// pool, a template or a verifier cannot quietly break the mapping between a
// problem and the sentence a child reads.
let phrasingChecked = 0;
for (const pool of MATH_POOLS) {
    const path = join(ROOT, 'public/data/math', `${pool}.json`);
    let data;
    try {
        data = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
        fail(`could not read math pool ${pool}.json`);
        continue;
    }
    for (const problem of data.problems ?? []) {
        const english = {
            prompt: problem.prompt?.text ?? '',
            hint: problem.hint ?? '',
            explanation: problem.explanation ?? '',
        };
        // A missing phrasing entry is not a runtime error -- it falls back to
        // English -- which is exactly why it needs a gate. `npm run
        // math:materialize` regenerates problems_curriculum.json from the
        // authoring seed and knows nothing about phrasing, so it silently
        // stripped 2885 entries once; the game kept working and kept showing
        // English. Coverage is 100% today, so require it: anything with words to
        // translate must carry a phrasing reference.
        for (const [field, text] of Object.entries(english)) {
            if (!text || !/[A-Za-z]{2,}/.test(text)) continue;
            if (!problem.phrasing?.[field]) {
                fail(
                    `[${problem.id}] ${field} has English text but no phrasing reference, `
                    + `so it will render in English in every locale — run npm run math:phrasing: `
                    + JSON.stringify(text),
                );
            }
        }

        for (const [field, ref] of Object.entries(problem.phrasing ?? {})) {
            phrasingChecked++;
            const rendered = render(ref.key, ref.params, TEMPLATES, 'en');
            if (rendered === null) {
                fail(`[${problem.id}] ${field} phrasing names unknown key [${ref.key}]`);
                continue;
            }
            if (rendered !== english[field]) {
                fail(
                    `[${problem.id}] ${field} phrasing does not round-trip: `
                    + `rendered ${JSON.stringify(rendered)} but the pool says ${JSON.stringify(english[field])}`,
                );
                continue;
            }
            const problem_ = verify(ref.key, ref.params, problem);
            if (problem_) {
                fail(`[${problem.id}] ${field} phrasing contradicts the problem's answer: ${problem_}`);
            }

            // The `plural` marker is what tells each runtime which number drives
            // agreement. Missing, and Icelandic renders "1 hópar af 2"; present
            // where it should not be, and a locale looks for a `.one` form that
            // no bundle has.
            const expected = PLURAL_PARAM[ref.key];
            if (expected !== ref.plural) {
                fail(
                    `[${problem.id}] ${field} phrasing has plural=${JSON.stringify(ref.plural)} `
                    + `but the catalog says ${JSON.stringify(expected)} for [${ref.key}] `
                    + `— run npm run math:phrasing`,
                );
            }
        }
    }
}

// ── 7. math phrasing: every rendered sentence fits its box in both locales ─
/**
 * Fit for the phrasing templates, checked against real problems rather than the
 * templates alone.
 *
 * A template's own length says little: "What comes next in the number pattern:
 * {seq}" is short until {seq} is "22, 16, 19, 15, 22, 16, 19, ?". So this walks
 * the actual pools, renders each problem's prompt and hint in both locales, and
 * requires the wrapped block to fit at the FLOOR size the renderer will shrink
 * to. Passing here is what makes MathBoard's floor unreachable in practice.
 *
 * Numbers from src/ui/components/MathBoard.ts.
 */
const PHRASING_BOXES = {
    prompt: { wrap: 460, floor: 20, maxH: 96, where: 'MathBoard question band' },
    hint: { wrap: 460, floor: 16, maxH: 72, where: 'MathBoard hint band below the board' },
};

/** Greedy word wrap, matching what Phaser does at a monospace advance. */
function wrappedLines(text, size, wrapWidth) {
    const perLine = Math.max(1, Math.floor(wrapWidth / (size * ADVANCE_RATIO)));
    let lines = 1;
    let used = 0;
    for (const word of String(text).split(' ')) {
        const add = (used > 0 ? 1 : 0) + word.length;
        if (used + add > perLine && used > 0) {
            lines++;
            used = word.length;
        } else {
            used += add;
        }
    }
    return lines;
}

/** Render a phrasing ref through one locale's bundle, nesting included. */
function renderIn(bundle, ref, locale) {
    if (!ref?.key) return null;
    // Measure the form this locale will actually show, not the base form.
    const key = ref.plural ? pluralKey(ref.key, ref.params, locale) : ref.key;
    const template = bundle[key] ?? bundle[ref.key];
    if (template === undefined) return null;
    const params = {};
    for (const [name, value] of Object.entries(ref.params ?? {})) {
        params[name] = (value && typeof value === 'object')
            ? (renderIn(bundle, value, locale) ?? '?')
            : value;
    }
    return format(template, params, bundle);
}

const worstFit = {};
for (const pool of MATH_POOLS) {
    let data;
    try {
        data = JSON.parse(readFileSync(join(ROOT, 'public/data/math', `${pool}.json`), 'utf8'));
    } catch {
        continue;
    }
    for (const problem of data.problems ?? []) {
        for (const [field, box] of Object.entries(PHRASING_BOXES)) {
            const english = field === 'prompt' ? (problem.prompt?.text ?? '') : (problem[field] ?? '');
            if (!english) continue;
            for (const locale of LOCALES) {
                const ref = problem.phrasing?.[field];
                const text = (ref && renderIn(bundles[primaryDir][locale], ref, locale)) ?? english;
                const height = wrappedLines(text, box.floor, box.wrap) * box.floor * 1.2;
                const seen = worstFit[`${field}:${locale}`];
                if (!seen || height > seen.height) {
                    worstFit[`${field}:${locale}`] = { height, text, problem: problem.id };
                }
                measured++;
                if (height > box.maxH) {
                    fail(
                        `[${problem.id}] ${field} in ${locale.toUpperCase()} does not fit even at its `
                        + `${box.floor}px floor: ${Math.ceil(height)}px of wrapped text in a ${box.maxH}px `
                        + `band (${box.where}): ${JSON.stringify(text)}`,
                    );
                }
            }
        }
    }
}

// ── report ─────────────────────────────────────────────────────────────────
if (failures.length === 0) {
    const keyCount = Object.keys(reference).length;
    console.log(
        `i18n guard: clean (${keyCount} keys x ${LOCALES.length} locales x ${BUNDLE_DIRS.length} targets, ` +
        `${measured} fit checks, ${phrasingChecked} math phrasings round-tripped and verified)`,
    );
    for (const [what, w] of Object.entries(worstFit)) {
        console.log(`  tightest ${what.padEnd(16)} ${String(Math.ceil(w.height)).padStart(3)}px  ${w.problem}`);
    }
    process.exit(0);
}

console.log(`i18n guard: ${failures.length} problem(s)`);
for (const f of failures) console.log(`  ${f}`);
process.exit(1);
