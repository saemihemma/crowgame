/**
 * The phrasing catalog: every English sentence the math pools say, as a template.
 *
 * Measured, not guessed. Across the 3150 problems in godot/data/math/*.json there
 * are 8232 English strings but only 381 distinct shapes once you replace the
 * numbers with placeholders -- and far fewer once the operator, the glyph run and
 * the counting sequence also become parameters. This file is that collapsed set.
 *
 * TWO THINGS LIVE HERE, AND THEY ARE THE SAME THING
 * -------------------------------------------------
 * `TEMPLATES` holds the canonical English for every phrasing key. `matchers` holds
 * the parsers that turn an existing English string back into { key, params }.
 *
 * The matchers are DERIVED FROM THE TEMPLATES, mechanically, by
 * `matcherFor()`: the literal text is escaped, each {placeholder} becomes a
 * capture group, and the whole thing is anchored. Nothing is hand-written twice.
 * That is deliberate -- a hand-rolled regex beside a hand-written template is two
 * copies of one fact, and they drift. Here a template edit moves its parser with
 * it, and `tools/derive_math_phrasing.mjs` still round-trips every single
 * derivation through `format()` and rejects any that does not reproduce the
 * original string exactly.
 *
 * PARAMETERS CARRY NO LANGUAGE
 * ----------------------------
 * A parameter's type comes from its NAME, so the templates stay readable for a
 * translator:
 *
 *   op       the operator symbol: + - x /   (locale-neutral notation)
 *   glyphs   a counting run, e.g. "o o o o" (locale-neutral)
 *   seq      a prompt sequence, e.g. "3, 6, 9, ?" or "1, __, 3, 4, 5"
 *   run      a plain number list, e.g. "12, 13, 14"
 *   inner    a nested phrasing -- see below
 *   anything else is a number
 *
 * All natural language is in the template, never in a parameter, so every string
 * a child reads inherits the guards in tools/validate_i18n.mjs: the Latin-1 glyph
 * allowlist, EN/IS lockstep, placeholder parity and the pixel fit budget.
 *
 * NESTING
 * -------
 * About 120 prompts are a prefixed form of another prompt: "Mixed fact: What is
 * 3 x 4?", "Borrow and solve: Complete: 12 - 5 = ?". Rather than 8 leads x 8
 * prefixes = 64 templates to translate, a `wrap.*` template takes an {inner}
 * that is itself a { key, params } pair -- or a plain string when the inner
 * phrasing contains no words to translate ("Borrow and solve: 12 - 5 ="). So the
 * 64 combinations cost 15 strings, and `format()` renders them recursively.
 *
 * A NOTE ON WHAT IS *NOT* HERE
 * ----------------------------
 * Strings with no letters -- "7 + 3 = ?", "4 + 4 + 4 = ?", "2, 4, 6, 8, ?" --
 * need no template. They are already the same in every language. The derivation
 * classifies them as locale-neutral and leaves them alone.
 */

// ── plurals ────────────────────────────────────────────────────────────────
/**
 * Some phrasings inflect with one of their numbers, and getting it wrong is
 * visible to a child.
 *
 * Icelandic agreement follows the numeral: 1 (and 21, 31, 41 -- anything ending
 * in 1 except 11) takes the singular. "3 hópar af 4" is right and "1 hópar af 4"
 * is not; it has to be "1 hópur af 4", with the verb changing too.
 *
 * English has the same problem and the pools already got it wrong. Measured:
 * "Think of 1 groups of 2." x23, "1 groups of 2 makes 2." x23, "There are 1
 * altogether." x2, "makes 1 groups." x7. Fifty-five strings of broken English
 * that a child reads today.
 *
 * So this is not a translation workaround, it is a missing feature. Each
 * plural-sensitive key names the parameter that drives it, and carries a `.one`
 * sibling in every bundle. The category is resolved per locale at render time,
 * NOT baked into the data -- the two rules happen to agree over the values the
 * pools currently use (none of them reaches 21), and hard-coding English's rule
 * into a locale-neutral field is exactly the kind of thing that works until
 * someone adds a problem with 21 in it.
 */
export const PLURAL_PARAM = {
    // The word problems inflect their subject noun with the first number, in
    // both languages: "1 bird sits" / "1 fugl situr", and Icelandic does it again
    // at 21, 31 and so on. The SECOND number needs no form of its own -- the
    // Icelandic wording puts it in an impersonal construction ("Þeim fjölgar um
    // {b}", where "fjölgar" does not inflect) or as a plain object, so one
    // dimension is enough.
    'math.prompt.word.birds_land': 'a',
    'math.prompt.word.birds_fly': 'a',
    'math.prompt.word.berries_find': 'a',
    'math.prompt.word.berries_eat': 'a',
    'math.prompt.word.berries_shared': 'a',
    'math.hint.groups': 'a',
    'math.hint.groups_makes': 'a',
    'math.expl.mul': 'a',
    'math.expl.div': 'n',
    'math.expl.total': 'n',
    // These three commit to a plural noun the same way. Their driving number
    // never reaches 1 in the pools as they stand, so nothing renders wrongly
    // today -- but a counting problem with one dot in it is an ordinary thing to
    // author, and "Það eru 1 punktar" is the same bug as the 55 already fixed.
    'math.expl.stars': 'n',
    'math.expl.dots': 'n',
};

/** CLDR-style category per locale. Only 'one' and 'other' are needed here. */
export const PLURAL_RULES = {
    en: n => (n === 1 ? 'one' : 'other'),
    is: n => (n % 10 === 1 && n % 100 !== 11 ? 'one' : 'other'),
};

/** The bundle key to actually look up, given a base key and its parameters. */
export function pluralKey(key, params, locale = 'en') {
    const param = PLURAL_PARAM[key];
    if (param === undefined) return key;
    const value = params?.[param];
    if (typeof value !== 'number') return key;
    const rule = PLURAL_RULES[locale] ?? PLURAL_RULES.en;
    return rule(value) === 'one' ? `${key}.one` : key;
}

// ── rendering ──────────────────────────────────────────────────────────────

const PLACEHOLDER = /\{([a-z][a-z0-9]*)\}/g;

/**
 * Render a template with named parameters. A parameter may be a nested
 * { key, params } pair, which is rendered through its own template first.
 */
export function format(template, params, templates = TEMPLATES) {
    return String(template).replace(PLACEHOLDER, (whole, name) => {
        const value = params?.[name];
        if (value === undefined || value === null) return whole;
        if (typeof value === 'object' && typeof value.key === 'string') {
            const nested = templates[pluralKey(value.key, value.params)];
            if (nested === undefined) return whole;
            return format(nested, value.params ?? {}, templates);
        }
        return String(value);
    });
}

/** Render a phrasing reference. Used by the round-trip check and the validator. */
export function render(key, params, templates = TEMPLATES, locale = 'en') {
    const template = templates[pluralKey(key, params, locale)];
    if (template === undefined) return null;
    return format(template, params ?? {}, templates);
}

/** True when a string contains natural language that needs translating. */
export const hasWords = s => /[A-Za-z]{2,}/.test(s ?? '');

// ── matcher derivation ─────────────────────────────────────────────────────

const NUMBER = '(\\d+)';
const PARAM_PATTERN = {
    op: '([+\\-−*/×÷])',
    glyphs: '(\\S(?: \\S)*)',
    seq: '(\\d+(?:, (?:\\d+|__|\\?))*)',
    run: '(\\d+(?:, \\d+)*)',
    run2: '(\\d+(?:, \\d+)*)',
    inner: '(.+)',
};

const patternFor = name => PARAM_PATTERN[name] ?? NUMBER;
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Turn one template into a parser.
 *
 * A repeated placeholder ("{a} plus {b} makes {sum}! Double {a} is {sum}!") gets a
 * capture group at every occurrence rather than a backreference, and the first
 * capture wins. That is on purpose: a backreference would silently refuse to
 * match a string where the two differ, while capturing both lets the round-trip
 * check in derive_math_phrasing.mjs report it as a rejection instead.
 */
export function matcherFor(key, template) {
    const names = [];
    let source = '^';
    let cursor = 0;
    for (const match of template.matchAll(PLACEHOLDER)) {
        source += escapeRe(template.slice(cursor, match.index));
        source += patternFor(match[1]);
        names.push(match[1]);
        cursor = match.index + match[0].length;
    }
    source += escapeRe(template.slice(cursor)) + '$';
    const re = new RegExp(source);

    // Literal characters outside placeholders. More literal text means a more
    // specific template, which is how the matchers get ordered.
    const literalLength = template.replace(PLACEHOLDER, '').length;

    return {
        key,
        literalLength,
        parse(text) {
            const m = re.exec(text);
            if (!m) return null;
            const params = {};
            names.forEach((name, i) => {
                if (params[name] === undefined) {
                    params[name] = name in PARAM_PATTERN ? m[i + 1] : Number(m[i + 1]);
                }
            });
            return params;
        },
    };
}

/**
 * Build the matcher list for one field, most specific first.
 *
 * Anchoring already stops most cross-talk ("Start at 10, then count 2 more steps
 * to reach 12." cannot match "Start at {a}, then count {b} more." because that
 * template ends at the full stop), but ordering by literal length makes the
 * remaining near-misses deterministic rather than dependent on object key order.
 */
/**
 * A `.one` template parses to its BASE key, not to itself. The data stores the
 * base key plus its parameters; which of the two forms renders is decided per
 * locale at render time by pluralKey(). So "Think of 1 group of 2." derives to
 * math.hint.groups with a=1, and Icelandic then renders its own `.one` form.
 */
function buildMatchers(keys) {
    return keys
        .map(key => {
            const matcher = matcherFor(key, TEMPLATES[key]);
            return key.endsWith('.one')
                ? { ...matcher, key: key.slice(0, -'.one'.length) }
                : matcher;
        })
        .sort((a, b) => b.literalLength - a.literalLength);
}

// ── the templates ──────────────────────────────────────────────────────────

/**
 * Canonical English for every phrasing key. This file is the single source: the
 * `en` entries in the four i18n bundles are generated from here (see
 * `npm run i18n:sync-math`), and the `is` entries are hand-authored against them.
 *
 * Counts in the comments are occurrences across the 3000 problems, measured.
 */
export const TEMPLATES = {
    // ── prompts: arithmetic ───────────────────────────────────────────────
    // 2500 arithmetic problems, eight ways of asking, one operator parameter.
    // "7 + 3 = ?" and "7 + 3 =" are wordless and need no template.
    'math.prompt.arith.what_is': 'What is {a} {op} {b}?',
    'math.prompt.arith.complete': 'Complete: {a} {op} {b} = ?',
    'math.prompt.arith.quick_check': 'Quick check: {a} {op} {b}',
    'math.prompt.arith.solve': 'Solve: {a} {op} {b}',
    'math.prompt.arith.equals_word': '{a} {op} {b} equals ?',
    'math.prompt.arith.how_much': 'How much is {a} {op} {b}?',
    'math.prompt.arith.answer': 'Answer: {a} {op} {b}',
    'math.prompt.arith.try_this': 'Try this: {a} {op} {b}',

    // ── prompts: prefixes that wrap another prompt ────────────────────────
    'math.prompt.wrap.mixed_fact': 'Mixed fact: {inner}',
    'math.prompt.wrap.mixed_upper_fact': 'Mixed upper fact: {inner}',
    'math.prompt.wrap.final_mixed_fact': 'Final mixed fact: {inner}',
    'math.prompt.wrap.try_borrow': 'Try this borrow problem: {inner}',
    'math.prompt.wrap.quick_borrow': 'Quick borrow fact: {inner}',
    'math.prompt.wrap.finish_borrow': 'Finish this borrow problem: {inner}',
    'math.prompt.wrap.borrow_solve': 'Borrow and solve: {inner}',

    // ── prompts: counting a run of glyphs ─────────────────────────────────
    'math.prompt.count.these': 'Count these: {glyphs}',
    'math.prompt.count.dots': 'Count the dots: {glyphs}',
    'math.prompt.count.marks': 'Count the marks: {glyphs}',
    'math.prompt.count.how_many': 'How many are here: {glyphs}',
    'math.prompt.count.how_many_stars': 'How many stars? {glyphs}',
    'math.prompt.count.how_many_dots': 'How many dots? {glyphs}',

    // ── prompts: comparison ───────────────────────────────────────────────
    'math.prompt.cmp.which_greater': 'Which number is greater: {a} or {b}?',
    'math.prompt.cmp.which_smaller': 'Which number is smaller: {a} or {b}?',
    'math.prompt.cmp.which_bigger': 'Which number is bigger: {a} or {b}?',
    'math.prompt.cmp.pick_greater': 'Pick the greater number: {a} or {b}',
    'math.prompt.cmp.pick_smaller': 'Pick the smaller number: {a} or {b}',
    'math.prompt.cmp.find_greater': 'Find the greater number: {a} or {b}',
    'math.prompt.cmp.find_smaller': 'Find the smaller number: {a} or {b}',
    'math.prompt.cmp.is_bigger': 'Which is bigger: {a} or {b}?',
    'math.prompt.cmp.is_smaller': 'Which is smaller: {a} or {b}?',

    // ── prompts: word problems ────────────────────────────────────────────
    // A narrative wrapper round the same arithmetic. Two numbers each, and in
    // English the subject noun inflects with the first one.
    'math.prompt.word.birds_land': '{a} birds sit on a branch. {b} more land. How many birds?',
    'math.prompt.word.birds_land.one': '{a} bird sits on a branch. {b} more land. How many birds?',
    'math.prompt.word.birds_fly': '{a} birds sit on a branch. {b} fly away. How many are left?',
    'math.prompt.word.birds_fly.one': '{a} bird sits on a branch. {b} fly away. How many are left?',
    'math.prompt.word.berries_find': 'You have {a} berries. You find {b} more. How many berries?',
    'math.prompt.word.berries_find.one': 'You have {a} berry. You find {b} more. How many berries?',
    'math.prompt.word.berries_eat': 'You have {a} berries. You eat {b}. How many are left?',
    'math.prompt.word.berries_eat.one': 'You have {a} berry. You eat {b}. How many are left?',
    // Multiplicative stories (equal groups, partitive sharing). Both operands
    // are authored >= 2, so only the shared-berries count can hit an Icelandic
    // singular-agreement number (21, 31, ...) — hence its plural param.
    'math.prompt.word.nests_eggs': 'There are {a} nests. Each nest has {b} eggs. How many eggs in all?',
    'math.prompt.word.berries_shared': '{a} berries are shared by {b} birds. How many berries does each bird get?',
    'math.prompt.word.berries_shared.one': '{a} berry is shared by {b} birds. How many berries does each bird get?',

    // ── prompts: sequences and patterns ───────────────────────────────────
    'math.prompt.seq.next_number_pattern': 'What comes next in the number pattern: {seq}',
    'math.prompt.seq.next_repeat_pattern': 'What comes next in the repeat pattern: {seq}',
    'math.prompt.seq.keep_pattern': 'Keep the pattern going: {seq}',
    'math.prompt.seq.keep_repeat': 'Keep the repeat going: {seq}',
    'math.prompt.seq.what_number_next': 'What number comes next? {seq}',
    'math.prompt.seq.what_next': 'What comes next? {seq}',
    'math.prompt.seq.fill_blank': 'Fill in the blank: {seq}',
    'math.prompt.seq.after': 'What comes after {a}?',
    'math.prompt.seq.before': 'What comes before {a}?',

    // ── hints ─────────────────────────────────────────────────────────────
    // The four big families first: count on (838), count back (755), groups
    // (381), share (241). Together 2215 of the 2993 hints.
    'math.hint.count_on': 'Start at {a}, then count {b} more.',
    'math.hint.count_back': 'Start at {a}, then count back {b}.',
    'math.hint.groups': 'Think of {a} groups of {b}.',
    'math.hint.groups.one': 'Think of {a} group of {b}.',
    'math.hint.share': 'Share {a} into groups of {b}.',
    'math.hint.changing': 'Look at how the numbers are changing each time.',
    'math.hint.touch_each': 'Touch each one once as you count.',
    'math.hint.more_value': 'Look at which number has more value.',
    'math.hint.repeating': 'See which numbers are repeating in order.',
    // Grade 3-4 place-value strategies (multi-digit tiers and beyond-tables).
    'math.hint.place_add': 'Add the hundreds, then the tens, then the ones.',
    'math.hint.place_sub': 'Take away the hundreds, then the tens, then the ones.',
    'math.hint.split_tens': 'Multiply the tens, multiply the ones, then add the two parts.',

    // Bridging through ten, and two-step subtraction.
    'math.hint.bridge_add': '{a} + {b} = {sum}, then add {c} more!',
    'math.hint.bridge_makes': '{a} + {b} = {sum}, then {c} more makes {total}.',
    'math.hint.bridge_makes_x': '{a} + {b} = {sum}, then {c} more makes {total}!',
    'math.hint.bridge_and_makes_x': '{a} + {b} = {sum}, and {c} more makes {total}!',
    'math.hint.bridge_mul': '{a} × {b} = {product}, then add {c} more!',
    'math.hint.two_step_sub': '{a} - {b} = {mid}, then {mid} - {c} = {diff}.',
    'math.hint.two_step_sub_x': '{a} - {b} = {mid}, then {mid} - {c} = {diff}!',
    'math.hint.two_step_take_away': '{a} - {b} = {mid}, then take away {c} more!',
    'math.hint.two_step_subtract': '{a} + {b} = {sum}, then subtract {c}!',
    'math.hint.tens_and_ones_add': '{a} + {b} = {sum}, and {c} + {d} = {sum2}. Total: {total}!',
    'math.hint.tens_and_ones_sub': '{a} - {b} = {diff}, and {c} - {d} = {diff2}. Total: {total}!',
    'math.hint.add_tens_ones':
        'Add the tens: {a} + {b} = {sum}, then add the ones: {c} + {d} = {sum2}. Total: {total}!',
    'math.hint.think_sum': 'Think: {a} + {b} = {sum}.',

    // Counting on, in all its variants.
    'math.hint.count_on_x': 'Start at {a}, then count {b} more!',
    'math.hint.count_on_run': 'Start at {a}, then count {b} more: {run}.',
    'math.hint.count_on_run_x': 'Start at {a}, then count {b} more: {run}!',
    'math.hint.count_on_and_run_x': 'Start at {a} and count {b} more: {run}!',
    'math.hint.count_on_reach': 'Start at {a}, then count {b} more steps to reach {target}.',
    'math.hint.count_on_reach_one': 'Start at {a}, then count {b} more step to reach {target}.',
    'math.hint.count_one_more': 'Start at {a} and count {b} more!',
    'math.hint.count_just_more': 'Start at {a} and count just {b} more!',
    'math.hint.count_one_more_word': 'Start at {a} and count one more!',
    'math.hint.count_up_more': 'Start at {a} and count up {b} more!',
    'math.hint.count_back_more': 'Start at {a} and count back {b}!',
    'math.hint.bigger_first': 'Start at {a} (the bigger number), then count {b} more!',
    'math.hint.bigger_first_add': 'Start at {a} (the bigger number), then add {b}!',
    'math.hint.next_number': '{a} plus {b} is the next number: {sum}.',

    // Counting back and counting by.
    'math.hint.count_back_from_x': 'Count back from {a}!',
    'math.hint.count_back_from_run': 'Count back from {a}: {run}!',
    'math.hint.count_back_carefully': 'Count back from {a} carefully!',
    'math.hint.count_back_reach': 'Count back {b} from {a} to reach {diff}.',
    'math.hint.count_backwards': 'Count backwards!',
    'math.hint.count_backwards_from': 'Count backwards from {a}!',
    'math.hint.count_up_from': 'Count up from {a}!',
    'math.hint.count_by': 'Count by {step}s!',
    'math.hint.count_by_run_x': 'Count by {step}s: {run}!',
    'math.hint.count_by_until': 'Count by {step}s until you reach {target}!',
    'math.hint.count_carefully': 'Count carefully!',
    'math.hint.count_dot_carefully': 'Count each dot carefully!',
    'math.hint.count_one_one_more': 'Count: one... then one more!',

    // Taking away.
    'math.hint.take_away_how_many': 'You have {a}, take away {b}. How many are left?',
    'math.hint.take_away_count_back': 'You have {a}, take away {b}. Count back: {run}!',
    'math.hint.take_away_count_left': 'You have {a}, take away {b}. Count what is left!',
    'math.hint.take_away_count_back_one': 'You have {a}, take away {b}. Count back one from {a}!',
    'math.hint.take_away_think': 'You have {a}, take away {b}. Think: {b} + {diff} = {a}, so {diff} are left!',
    'math.hint.take_away_half': 'You have {a}, take away {b}. Half of {a} is left!',
    'math.hint.take_away_just_left': 'You have {a}, take away {b}. Just {diff} is left!',
    'math.hint.take_away_almost': 'You have {a}, take away {b}. Almost all gone!',
    'math.hint.take_away_almost_just': 'You have {a}, take away {b}. Almost all gone! Just {diff} left!',
    'math.hint.take_away_zero': 'Taking away {b} changes nothing, so {a} stays {a}.',
    'math.hint.take_all_away': 'If you take all {a} away, {diff} are left.',
    'math.hint.take_from': 'Take away {b} from {a}!',
    'math.hint.start_take_away': 'Start with {a} and take away {b}!',

    // Multiplication and division.
    'math.hint.groups_makes': '{a} groups of {b} makes...',
    'math.hint.groups_makes.one': '{a} group of {b} makes...',
    'math.hint.two_groups_all': 'Two groups of {b}! Count them all together!',
    'math.hint.how_many_fit': 'How many {b}s fit into {a}?',
    'math.hint.how_many_make': 'How many {b}s make {a}?',
    'math.hint.split_equal': 'Split {a} into {b} equal groups!',
    'math.hint.double_is': 'Double {a} is...',
    'math.hint.double_dice': 'Double {a}! Think of two dice both showing {a}!',

    // Fingers and hands, for the youngest band.
    'math.hint.hold_up_fingers': 'Hold up {a} fingers, then {b} more. Count them all!',
    'math.hint.one_hand_other': '{a} on one hand, {b} on the other. Count them all!',
    'math.hint.fingers_down': 'You have {a} fingers up, put {b} down. How many are still up?',
    'math.hint.count_fingers_more': 'Count {a} fingers, then count {b} more!',
    'math.hint.count_fingers_then': 'Count on your fingers: {a}, then {b} more!',
    'math.hint.start_fingers_put_down': 'Start with {a} fingers and put {b} down!',
    'math.hint.three_each_hand': 'Three fingers on each hand!',
    'math.hint.two_fingers_each': 'Two fingers on one hand, two on the other!',
    'math.hint.full_hand_plus': 'One full hand ({a}) plus {b} more fingers!',
    'math.hint.fingers_plus_hand': '{a} fingers plus a whole hand ({b})!',
    'math.hint.both_hands': 'Both hands! {a} fingers on each!',

    // Number sense.
    'math.hint.best_friends': '{a} and {b} are best friends that make {sum}!',
    'math.hint.just_away_from': '{a} is just {b} away from {sum}!',
    'math.hint.one_more_than_ten':
        '{a} plus {b} is one more than {sum}! Think: {a} + {c} = {sum}, plus {d} more!',
    'math.hint.ten_plus_easy': '{a} plus {b} is easy! Just put a {c} in front of the {b}!',
    'math.hint.one_plus_six': 'One plus six makes...',
    'math.hint.add_nothing': 'You have {a} and add nothing. Still {a}!',
    'math.hint.zero_nothing_just': 'Zero means nothing! So {a} plus {b} is just {sum}!',
    'math.hint.zero_nothing_there': 'Zero means nothing there! So you just have {a}!',
    'math.hint.zero_still_have': 'Adding zero means nothing changes. You still have {a}!',
    'math.hint.start_nothing_add': 'Start with nothing, add {b}. You get {sum}!',

    // Sequences, patterns and comparison.
    'math.hint.same_amount': 'Each number goes up by the same amount!',
    'math.hint.goes_up_by': 'Each number goes up by {step}!',
    'math.hint.in_order': 'The numbers go in order!',
    'math.hint.comes_first': 'Think about which number comes first when counting!',
    'math.hint.comes_later': 'Think about which number comes later when counting!',
    'math.hint.which_first': 'Which number comes first when counting?',
    'math.hint.what_next_counting': 'What comes next when counting?',
    'math.hint.point_star': 'Point to each star as you count!',

    // ── explanations ──────────────────────────────────────────────────────
    'math.expl.add': '{a} plus {b} makes {sum}.',
    'math.expl.add_x': '{a} plus {b} makes {sum}!',
    'math.expl.sub': '{a} take away {b} leaves {diff}.',
    'math.expl.sub_x': '{a} take away {b} leaves {diff}!',
    'math.expl.sub_just': '{a} take away {b} leaves just {diff}!',
    'math.expl.mul': '{a} groups of {b} makes {product}.',
    'math.expl.mul.one': '{a} group of {b} makes {product}.',
    'math.expl.div': '{a} split into groups of {b} makes {n} groups.',
    'math.expl.div.one': '{a} split into groups of {b} makes {n} group.',
    // Grade 3-4 place-value and sharing explanations.
    'math.expl.place_add': 'Add each place, hundreds to ones. The answer is {total}.',
    'math.expl.place_sub': 'Take away place by place. The answer is {n}.',
    'math.expl.split_tens': 'Multiply the tens by {b}, then the ones, and add the parts. The answer is {product}.',
    'math.expl.share_each': '{a} shared into {b} equal groups gives {n} each.',
    'math.expl.add_double': '{a} plus {b} makes {sum}! Double {a} is {sum}!',
    'math.expl.sub_half': '{a} take away {b} leaves {diff}! Half of {a} is {diff}!',
    'math.expl.all_fingers': '{a} plus {b} makes {sum}! That is all your fingers!',
    'math.expl.add_zero_same': '{a} plus {b} is {sum}! Adding zero keeps the number the same.',
    'math.expl.zero_nothing': 'Adding zero changes nothing. {a} plus {b} is {sum}!',
    'math.expl.zero_still': "{a} plus {b} is still {sum}! Zero doesn't add anything.",
    'math.expl.zero_any': '{a} plus {b} is {sum}! Zero plus any number is that number.',
    'math.expl.still': '{a} plus {b} is still {sum}!',
    'math.expl.total': 'There are {n} altogether.',
    'math.expl.total.one': 'There is {n} altogether.',
    'math.expl.stars': 'There are {n} stars!',
    'math.expl.stars.one': 'There is {n} star!',
    'math.expl.dots': 'There are {n} dots!',
    'math.expl.dots.one': 'There is {n} dot!',
    'math.expl.choice': '{n} is the correct choice.',
    'math.expl.bigger': '{a} is bigger than {b}',
    'math.expl.bigger_x': '{a} is bigger than {b}!',
    'math.expl.smaller': '{a} is smaller than {b}',
    'math.expl.smaller_x': '{a} is smaller than {b}!',
    'math.expl.after': 'After {a} comes {b}',
    'math.expl.before': 'Before {a} comes {b}',
    'math.expl.pattern_to': 'The pattern keeps going to {n}.',
    'math.expl.repeat_back': 'The repeating pattern comes back to {n}.',
    'math.expl.pattern_step': 'The pattern goes up by {step} each time: {run}!',
    'math.expl.pattern_count_by': 'The pattern is counting by {step}s: {run}',
    'math.expl.numbers_go': 'The numbers go {run}!',
    'math.expl.sequence_is': 'The sequence is: {run}',
    'math.expl.sequence_backwards': 'The sequence is counting backwards: {run}',
};

// ── matcher tables ─────────────────────────────────────────────────────────

const keysFor = prefix => Object.keys(TEMPLATES).filter(k => k.startsWith(prefix));

/** Prompt templates that are a phrasing in their own right, not a prefix. */
const PROMPT_LEAF_KEYS = keysFor('math.prompt.').filter(k => !k.startsWith('math.prompt.wrap.'));
const PROMPT_LEAF_MATCHERS = buildMatchers(PROMPT_LEAF_KEYS);

/**
 * Parse the text inside a prefix.
 *
 * Returns a nested { key, params } when the inner phrasing has a template, the
 * raw string when it has no words to translate ("12 - 5 ="), or null when it has
 * words we cannot place -- in which case the whole prefixed prompt is left in
 * English rather than half-translated.
 */
function parseInner(text) {
    if (!hasWords(text)) return text;
    for (const matcher of PROMPT_LEAF_MATCHERS) {
        const params = matcher.parse(text);
        if (params) return { key: matcher.key, params };
    }
    return null;
}

const PROMPT_WRAP_MATCHERS = buildMatchers(keysFor('math.prompt.wrap.')).map(matcher => ({
    ...matcher,
    parse(text) {
        const raw = matcher.parse(text);
        if (!raw) return null;
        const inner = parseInner(raw.inner);
        if (inner === null) return null;
        return { inner };
    },
}));

/**
 * Prefixes are tried before leaf phrasings. A prefixed prompt would otherwise
 * never reach its wrapper: "Mixed fact: What is 3 × 4?" cannot match any leaf
 * template (they are all anchored), so order is belt-and-braces here -- but it
 * also means the wrapper is checked once instead of after 39 failures.
 */
export const matchers = {
    prompt: [...PROMPT_WRAP_MATCHERS, ...PROMPT_LEAF_MATCHERS],
    hint: buildMatchers(keysFor('math.hint.')),
    explanation: buildMatchers(keysFor('math.expl.')),
};

/** Keys grouped by field, for the bundle sync and the validator. */
export const KEY_GROUPS = {
    prompt: keysFor('math.prompt.'),
    hint: keysFor('math.hint.'),
    explanation: keysFor('math.expl.'),
};

// ── semantic verification ──────────────────────────────────────────────────
/**
 * Round-tripping a derivation through its own template proves almost nothing.
 *
 * The matchers here are GENERATED FROM the templates, so rendering a parse back
 * through the same template reproduces the input by construction. Two deliberate
 * corruptions proved it: swapping `{a}` and `{b}` in `math.hint.count_back`, and
 * splitting its repeated `{mid}`, both round-tripped 3000/3000 clean. The first
 * of those is a bug that reaches a child -- with the operands swapped, the
 * Icelandic template renders "Byrjaðu á 0 og teldu 4 til baka" for a hint that
 * says "Start at 4, then count back 0".
 *
 * So the real check has to come from outside the catalog. Every problem carries
 * `answer.correct`, which no template can influence, and nearly every phrasing
 * that holds two or more numbers implies an arithmetic relationship to it. These
 * verifiers assert that relationship. A phrasing whose numbers do not agree with
 * the problem's own answer is rejected and the problem keeps its English.
 *
 * Each verifier returns null when it is satisfied, or a message when it is not.
 * Keys with no verifier are counted and reported, so the gap stays visible
 * instead of looking like success.
 */

const OPS = {
    '+': (a, b) => a + b,
    '-': (a, b) => a - b,
    '−': (a, b) => a - b,
    '*': (a, b) => a * b,
    '×': (a, b) => a * b,
    '/': (a, b) => a / b,
    '÷': (a, b) => a / b,
};

const answerOf = problem => problem?.answer?.correct;

/** Assert a computed value equals the problem's answer. */
const isAnswer = (value, problem, what) => (
    value === answerOf(problem)
        ? null
        : `${what} = ${value} but the problem's answer is ${answerOf(problem)}`
);

/** Assert an internal relationship inside the phrasing itself. */
const holds = (ok, what) => (ok ? null : `${what} does not hold`);

const nums = seq => String(seq).split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s)).map(Number);

/** Smallest repeating period of a list, or 0 when it does not repeat. */
function periodOf(list) {
    for (let p = 1; p <= Math.floor(list.length / 2); p++) {
        let repeats = true;
        for (let i = p; i < list.length; i++) {
            if (list[i] !== list[i - p]) { repeats = false; break; }
        }
        if (repeats) return p;
    }
    return 0;
}

/** The value a `{seq}` prompt is asking for, or null when we cannot tell. */
function nextInSequence(seq) {
    const list = nums(seq);
    if (list.length < 2) return null;
    const step = list[1] - list[0];
    if (list.every((v, i) => i === 0 || v - list[i - 1] === step)) return list[list.length - 1] + step;
    const period = periodOf(list);
    if (period > 0) return list[list.length - period];
    return null;
}

const arith = (p, problem) => {
    const op = OPS[p.op];
    if (!op) return `unknown operator ${JSON.stringify(p.op)}`;
    return isAnswer(op(p.a, p.b), problem, `${p.a} ${p.op} ${p.b}`);
};

const compare = pick => (p, problem) => {
    const want = pick(p.a, p.b);
    return isAnswer(want, problem, `${pick === Math.max ? 'greater' : 'smaller'} of ${p.a},${p.b}`);
};

const counted = (p, problem) => isAnswer(
    String(p.glyphs).trim().split(/\s+/).length, problem, 'glyph count',
);

const sequence = (p, problem) => {
    const next = nextInSequence(p.seq);
    if (next === null) return null; // not a shape we can verify
    return isAnswer(next, problem, `next in ${p.seq}`);
};

export const SEMANTICS = {
    // ── prompts ───────────────────────────────────────────────────────────
    'math.prompt.arith.what_is': arith,
    'math.prompt.arith.complete': arith,
    'math.prompt.arith.quick_check': arith,
    'math.prompt.arith.solve': arith,
    'math.prompt.arith.equals_word': arith,
    'math.prompt.arith.how_much': arith,
    'math.prompt.arith.answer': arith,
    'math.prompt.arith.try_this': arith,

    'math.prompt.count.these': counted,
    'math.prompt.count.dots': counted,
    'math.prompt.count.marks': counted,
    'math.prompt.count.how_many': counted,
    'math.prompt.count.how_many_stars': counted,
    'math.prompt.count.how_many_dots': counted,

    'math.prompt.cmp.which_greater': compare(Math.max),
    'math.prompt.cmp.which_bigger': compare(Math.max),
    'math.prompt.cmp.pick_greater': compare(Math.max),
    'math.prompt.cmp.find_greater': compare(Math.max),
    'math.prompt.cmp.is_bigger': compare(Math.max),
    'math.prompt.cmp.which_smaller': compare(Math.min),
    'math.prompt.cmp.pick_smaller': compare(Math.min),
    'math.prompt.cmp.find_smaller': compare(Math.min),
    'math.prompt.cmp.is_smaller': compare(Math.min),

    'math.prompt.seq.next_number_pattern': sequence,
    'math.prompt.seq.next_repeat_pattern': sequence,
    'math.prompt.seq.keep_pattern': sequence,
    'math.prompt.seq.keep_repeat': sequence,
    'math.prompt.seq.what_number_next': sequence,
    'math.prompt.seq.what_next': sequence,
    // Word problems: the narrative names which way the arithmetic runs.
    'math.prompt.word.birds_land': (p, problem) => isAnswer(p.a + p.b, problem, `${p.a}+${p.b}`),
    'math.prompt.word.berries_find': (p, problem) => isAnswer(p.a + p.b, problem, `${p.a}+${p.b}`),
    'math.prompt.word.nests_eggs': (p, problem) => isAnswer(p.a * p.b, problem, `${p.a}×${p.b}`),
    'math.prompt.word.berries_shared': (p, problem) => isAnswer(p.a / p.b, problem, `${p.a}÷${p.b}`),
    'math.expl.share_each': (p) => holds(p.a / p.b === p.n, `${p.a}÷${p.b}=${p.n}`),
    'math.prompt.word.birds_fly': (p, problem) => isAnswer(p.a - p.b, problem, `${p.a}-${p.b}`),
    'math.prompt.word.berries_eat': (p, problem) => isAnswer(p.a - p.b, problem, `${p.a}-${p.b}`),

    'math.prompt.seq.after': (p, problem) => isAnswer(p.a + 1, problem, `after ${p.a}`),
    'math.prompt.seq.before': (p, problem) => isAnswer(p.a - 1, problem, `before ${p.a}`),

    // ── hints ─────────────────────────────────────────────────────────────
    // These are the ones a swap would corrupt: two or more numbers with an
    // arithmetic relationship to the answer.
    'math.hint.count_on': (p, problem) => isAnswer(p.a + p.b, problem, `${p.a}+${p.b}`),
    'math.hint.count_on_x': (p, problem) => isAnswer(p.a + p.b, problem, `${p.a}+${p.b}`),
    'math.hint.count_one_more': (p, problem) => isAnswer(p.a + p.b, problem, `${p.a}+${p.b}`),
    'math.hint.count_just_more': (p, problem) => isAnswer(p.a + p.b, problem, `${p.a}+${p.b}`),
    'math.hint.count_up_more': (p, problem) => isAnswer(p.a + p.b, problem, `${p.a}+${p.b}`),
    'math.hint.count_fingers_more': (p, problem) => isAnswer(p.a + p.b, problem, `${p.a}+${p.b}`),
    'math.hint.count_fingers_then': (p, problem) => isAnswer(p.a + p.b, problem, `${p.a}+${p.b}`),
    'math.hint.hold_up_fingers': (p, problem) => isAnswer(p.a + p.b, problem, `${p.a}+${p.b}`),
    'math.hint.one_hand_other': (p, problem) => isAnswer(p.a + p.b, problem, `${p.a}+${p.b}`),
    'math.hint.bigger_first': (p, problem) => isAnswer(p.a + p.b, problem, `${p.a}+${p.b}`),
    'math.hint.bigger_first_add': (p, problem) => isAnswer(p.a + p.b, problem, `${p.a}+${p.b}`),
    'math.hint.count_on_run': (p, problem) => isAnswer(p.a + p.b, problem, `${p.a}+${p.b}`),
    'math.hint.count_on_run_x': (p, problem) => isAnswer(p.a + p.b, problem, `${p.a}+${p.b}`),
    'math.hint.count_on_and_run_x': (p, problem) => isAnswer(p.a + p.b, problem, `${p.a}+${p.b}`),
    'math.hint.count_on_reach': (p, problem) => holds(p.a + p.b === p.target, `${p.a}+${p.b}=${p.target}`)
        ?? isAnswer(p.target, problem, 'target'),
    'math.hint.count_on_reach_one': (p, problem) => holds(p.a + p.b === p.target, `${p.a}+${p.b}=${p.target}`)
        ?? isAnswer(p.target, problem, 'target'),

    'math.hint.count_back': (p, problem) => isAnswer(p.a - p.b, problem, `${p.a}-${p.b}`),
    'math.hint.count_back_more': (p, problem) => isAnswer(p.a - p.b, problem, `${p.a}-${p.b}`),
    'math.hint.start_take_away': (p, problem) => isAnswer(p.a - p.b, problem, `${p.a}-${p.b}`),
    'math.hint.take_from': (p, problem) => isAnswer(p.a - p.b, problem, `${p.a}-${p.b}`),
    'math.hint.fingers_down': (p, problem) => isAnswer(p.a - p.b, problem, `${p.a}-${p.b}`),
    'math.hint.start_fingers_put_down': (p, problem) => isAnswer(p.a - p.b, problem, `${p.a}-${p.b}`),
    'math.hint.take_away_how_many': (p, problem) => isAnswer(p.a - p.b, problem, `${p.a}-${p.b}`),
    'math.hint.take_away_count_back': (p, problem) => isAnswer(p.a - p.b, problem, `${p.a}-${p.b}`),
    'math.hint.take_away_count_left': (p, problem) => isAnswer(p.a - p.b, problem, `${p.a}-${p.b}`),
    'math.hint.take_away_count_back_one': (p, problem) => isAnswer(p.a - p.b, problem, `${p.a}-${p.b}`),
    'math.hint.take_away_almost': (p, problem) => isAnswer(p.a - p.b, problem, `${p.a}-${p.b}`),
    'math.hint.take_away_half': (p, problem) => isAnswer(p.a - p.b, problem, `${p.a}-${p.b}`),
    'math.hint.take_away_just_left': (p, problem) => holds(p.a - p.b === p.diff, `${p.a}-${p.b}=${p.diff}`)
        ?? isAnswer(p.diff, problem, 'diff'),
    'math.hint.take_away_almost_just': (p, problem) => holds(p.a - p.b === p.diff, `${p.a}-${p.b}=${p.diff}`)
        ?? isAnswer(p.diff, problem, 'diff'),
    'math.hint.take_away_think': (p, problem) => holds(p.b + p.diff === p.a, `${p.b}+${p.diff}=${p.a}`)
        ?? isAnswer(p.diff, problem, 'diff'),
    'math.hint.take_all_away': (p, problem) => isAnswer(p.diff, problem, 'remainder'),
    'math.hint.take_away_zero': (p, problem) => isAnswer(p.a - p.b, problem, `${p.a}-${p.b}`),
    'math.hint.count_back_reach': (p, problem) => holds(p.a - p.b === p.diff, `${p.a}-${p.b}=${p.diff}`)
        ?? isAnswer(p.diff, problem, 'diff'),

    'math.hint.groups': (p, problem) => isAnswer(p.a * p.b, problem, `${p.a}×${p.b}`),
    'math.hint.share': (p, problem) => isAnswer(p.a / p.b, problem, `${p.a}÷${p.b}`),
    'math.hint.split_equal': (p, problem) => isAnswer(p.a / p.b, problem, `${p.a}÷${p.b}`),
    'math.hint.how_many_fit': (p, problem) => isAnswer(p.a / p.b, problem, `${p.a}÷${p.b}`),
    'math.hint.how_many_make': (p, problem) => isAnswer(p.a / p.b, problem, `${p.a}÷${p.b}`),
    'math.hint.double_dice': (p, problem) => isAnswer(p.a * 2, problem, `double ${p.a}`),

    'math.hint.think_sum': p => holds(p.a + p.b === p.sum, `${p.a}+${p.b}=${p.sum}`),
    'math.hint.next_number': (p, problem) => holds(p.a + p.b === p.sum, `${p.a}+${p.b}=${p.sum}`)
        ?? isAnswer(p.sum, problem, 'sum'),
    'math.hint.best_friends': p => holds(p.a + p.b === p.sum, `${p.a}+${p.b}=${p.sum}`),
    'math.hint.just_away_from': p => holds(p.a + p.b === p.sum, `${p.a}+${p.b}=${p.sum}`),
    'math.hint.start_nothing_add': (p, problem) => holds(p.b === p.sum, `0+${p.b}=${p.sum}`)
        ?? isAnswer(p.sum, problem, 'sum'),
    'math.hint.zero_nothing_just': (p, problem) => holds(p.a + p.b === p.sum, `${p.a}+${p.b}=${p.sum}`)
        ?? isAnswer(p.sum, problem, 'sum'),

    'math.hint.bridge_add': (p, problem) => holds(p.a + p.b === p.sum, `${p.a}+${p.b}=${p.sum}`)
        ?? isAnswer(p.sum + p.c, problem, `${p.sum}+${p.c}`),
    'math.hint.bridge_makes': (p, problem) => holds(p.a + p.b === p.sum, `${p.a}+${p.b}=${p.sum}`)
        ?? holds(p.sum + p.c === p.total, `${p.sum}+${p.c}=${p.total}`)
        ?? isAnswer(p.total, problem, 'total'),
    'math.hint.bridge_makes_x': (p, problem) => holds(p.a + p.b === p.sum, `${p.a}+${p.b}=${p.sum}`)
        ?? holds(p.sum + p.c === p.total, `${p.sum}+${p.c}=${p.total}`)
        ?? isAnswer(p.total, problem, 'total'),
    'math.hint.bridge_and_makes_x': (p, problem) => holds(p.a + p.b === p.sum, `${p.a}+${p.b}=${p.sum}`)
        ?? holds(p.sum + p.c === p.total, `${p.sum}+${p.c}=${p.total}`)
        ?? isAnswer(p.total, problem, 'total'),
    'math.hint.bridge_mul': (p, problem) => holds(p.a * p.b === p.product, `${p.a}×${p.b}=${p.product}`)
        ?? isAnswer(p.product + p.c, problem, `${p.product}+${p.c}`),
    'math.hint.two_step_sub': (p, problem) => holds(p.a - p.b === p.mid, `${p.a}-${p.b}=${p.mid}`)
        ?? holds(p.mid - p.c === p.diff, `${p.mid}-${p.c}=${p.diff}`)
        ?? isAnswer(p.diff, problem, 'diff'),
    'math.hint.two_step_sub_x': (p, problem) => holds(p.a - p.b === p.mid, `${p.a}-${p.b}=${p.mid}`)
        ?? holds(p.mid - p.c === p.diff, `${p.mid}-${p.c}=${p.diff}`)
        ?? isAnswer(p.diff, problem, 'diff'),
    'math.hint.two_step_take_away': (p, problem) => holds(p.a - p.b === p.mid, `${p.a}-${p.b}=${p.mid}`)
        ?? isAnswer(p.mid - p.c, problem, `${p.mid}-${p.c}`),
    'math.hint.two_step_subtract': (p, problem) => holds(p.a + p.b === p.sum, `${p.a}+${p.b}=${p.sum}`)
        ?? isAnswer(p.sum - p.c, problem, `${p.sum}-${p.c}`),
    'math.hint.tens_and_ones_add': (p, problem) => holds(p.a + p.b === p.sum, `${p.a}+${p.b}=${p.sum}`)
        ?? holds(p.c + p.d === p.sum2, `${p.c}+${p.d}=${p.sum2}`)
        ?? holds(p.sum + p.sum2 === p.total, `${p.sum}+${p.sum2}=${p.total}`)
        ?? isAnswer(p.total, problem, 'total'),
    'math.hint.add_tens_ones': (p, problem) => holds(p.a + p.b === p.sum, `${p.a}+${p.b}=${p.sum}`)
        ?? holds(p.c + p.d === p.sum2, `${p.c}+${p.d}=${p.sum2}`)
        ?? holds(p.sum + p.sum2 === p.total, `${p.sum}+${p.sum2}=${p.total}`)
        ?? isAnswer(p.total, problem, 'total'),
    'math.hint.tens_and_ones_sub': (p, problem) => holds(p.a - p.b === p.diff, `${p.a}-${p.b}=${p.diff}`)
        ?? holds(p.c - p.d === p.diff2, `${p.c}-${p.d}=${p.diff2}`)
        ?? holds(p.diff + p.diff2 === p.total, `${p.diff}+${p.diff2}=${p.total}`)
        ?? isAnswer(p.total, problem, 'total'),
    'math.hint.one_more_than_ten': (p, problem) => holds(p.a + p.c === p.sum, `${p.a}+${p.c}=${p.sum}`)
        ?? holds(p.c + p.d === p.b, `${p.c}+${p.d}=${p.b}`)
        ?? isAnswer(p.sum + p.d, problem, `${p.sum}+${p.d}`),
    'math.hint.add_nothing': (p, problem) => isAnswer(p.a, problem, 'unchanged value'),
    'math.hint.zero_nothing_there': (p, problem) => isAnswer(p.a, problem, 'unchanged value'),
    'math.hint.zero_still_have': (p, problem) => isAnswer(p.a, problem, 'unchanged value'),
    'math.hint.ten_plus_easy': (p, problem) => isAnswer(p.a + p.b, problem, `${p.a}+${p.b}`),
    'math.hint.full_hand_plus': (p, problem) => isAnswer(p.a + p.b, problem, `${p.a}+${p.b}`),
    'math.hint.fingers_plus_hand': (p, problem) => isAnswer(p.a + p.b, problem, `${p.a}+${p.b}`),
    'math.hint.both_hands': (p, problem) => isAnswer(p.a * 2, problem, `${p.a}×2`),
    'math.hint.two_groups_all': (p, problem) => isAnswer(p.b * 2, problem, `2×${p.b}`),
    'math.hint.double_is': (p, problem) => isAnswer(p.a * 2, problem, `double ${p.a}`),
    'math.hint.count_by_until': (p, problem) => isAnswer(p.target / p.step, problem, 'groups'),
    'math.hint.goes_up_by': p => holds(p.step > 0, `step ${p.step} is positive`),

    // ── explanations ──────────────────────────────────────────────────────
    'math.expl.add': (p, problem) => holds(p.a + p.b === p.sum, `${p.a}+${p.b}=${p.sum}`)
        ?? isAnswer(p.sum, problem, 'sum'),
    'math.expl.add_x': (p, problem) => holds(p.a + p.b === p.sum, `${p.a}+${p.b}=${p.sum}`)
        ?? isAnswer(p.sum, problem, 'sum'),
    'math.expl.add_double': (p, problem) => holds(p.a + p.b === p.sum, `${p.a}+${p.b}=${p.sum}`)
        ?? isAnswer(p.sum, problem, 'sum'),
    'math.expl.all_fingers': (p, problem) => holds(p.a + p.b === p.sum, `${p.a}+${p.b}=${p.sum}`)
        ?? isAnswer(p.sum, problem, 'sum'),
    'math.expl.add_zero_same': (p, problem) => holds(p.a + p.b === p.sum, `${p.a}+${p.b}=${p.sum}`)
        ?? isAnswer(p.sum, problem, 'sum'),
    'math.expl.zero_nothing': (p, problem) => holds(p.a + p.b === p.sum, `${p.a}+${p.b}=${p.sum}`)
        ?? isAnswer(p.sum, problem, 'sum'),
    'math.expl.zero_still': (p, problem) => holds(p.a + p.b === p.sum, `${p.a}+${p.b}=${p.sum}`)
        ?? isAnswer(p.sum, problem, 'sum'),
    'math.expl.zero_any': (p, problem) => holds(p.a + p.b === p.sum, `${p.a}+${p.b}=${p.sum}`)
        ?? isAnswer(p.sum, problem, 'sum'),
    'math.expl.still': (p, problem) => holds(p.a + p.b === p.sum, `${p.a}+${p.b}=${p.sum}`)
        ?? isAnswer(p.sum, problem, 'sum'),
    'math.expl.sub': (p, problem) => holds(p.a - p.b === p.diff, `${p.a}-${p.b}=${p.diff}`)
        ?? isAnswer(p.diff, problem, 'diff'),
    'math.expl.sub_x': (p, problem) => holds(p.a - p.b === p.diff, `${p.a}-${p.b}=${p.diff}`)
        ?? isAnswer(p.diff, problem, 'diff'),
    'math.expl.sub_just': (p, problem) => holds(p.a - p.b === p.diff, `${p.a}-${p.b}=${p.diff}`)
        ?? isAnswer(p.diff, problem, 'diff'),
    'math.expl.sub_half': (p, problem) => holds(p.a - p.b === p.diff, `${p.a}-${p.b}=${p.diff}`)
        ?? isAnswer(p.diff, problem, 'diff'),
    'math.expl.mul': (p, problem) => holds(p.a * p.b === p.product, `${p.a}×${p.b}=${p.product}`)
        ?? isAnswer(p.product, problem, 'product'),
    'math.expl.div': (p, problem) => holds(p.a / p.b === p.n, `${p.a}÷${p.b}=${p.n}`)
        ?? isAnswer(p.n, problem, 'quotient'),
    'math.expl.total': (p, problem) => isAnswer(p.n, problem, 'total'),
    'math.expl.stars': (p, problem) => isAnswer(p.n, problem, 'total'),
    'math.expl.dots': (p, problem) => isAnswer(p.n, problem, 'total'),
    'math.expl.choice': (p, problem) => isAnswer(p.n, problem, 'choice'),
    'math.expl.pattern_to': (p, problem) => isAnswer(p.n, problem, 'next'),
    'math.expl.repeat_back': (p, problem) => isAnswer(p.n, problem, 'next'),
    'math.expl.bigger': (p, problem) => holds(p.a > p.b, `${p.a}>${p.b}`) ?? isAnswer(p.a, problem, 'bigger'),
    'math.expl.bigger_x': (p, problem) => holds(p.a > p.b, `${p.a}>${p.b}`) ?? isAnswer(p.a, problem, 'bigger'),
    'math.expl.smaller': (p, problem) => holds(p.a < p.b, `${p.a}<${p.b}`) ?? isAnswer(p.a, problem, 'smaller'),
    'math.expl.smaller_x': (p, problem) => holds(p.a < p.b, `${p.a}<${p.b}`) ?? isAnswer(p.a, problem, 'smaller'),
    'math.expl.after': (p, problem) => holds(p.b === p.a + 1, `${p.a}+1=${p.b}`) ?? isAnswer(p.b, problem, 'next'),
    'math.expl.before': (p, problem) => holds(p.b === p.a - 1, `${p.a}-1=${p.b}`) ?? isAnswer(p.b, problem, 'previous'),
};


// ── operand-order invariant ────────────────────────────────────────────────
/**
 * The answer check above has a blind spot, and it is not a small one:
 * multiplication and addition commute. Swapping `{a}` and `{b}` in
 * `math.expl.mul` still satisfies a * b == answer, still round-trips, and still
 * ships a bug -- the Icelandic template "{a} hópar af {b} verða {product}." then
 * renders "4 hópar af 3" for a problem that says "3 groups of 4". Same for
 * `math.hint.count_on`: "Start at 3, then count 8 more" is arithmetically fine
 * and pedagogically backwards.
 *
 * Closing it needs a second source of truth for ORDER, and prompt.text is one:
 * it holds the operands in the order the problem poses them, and it is not
 * derived from this catalog. So the invariant is "{a} and {b} are the prompt's
 * first and second operand".
 *
 * Which templates that holds for was MEASURED, not assumed. Across all 3000
 * problems, 60 templates satisfy it on every single occurrence, and two --
 * bigger_first and bigger_first_add -- commute it on every single occurrence,
 * which is their entire point ("Start at 8 (the bigger number), then count 3
 * more!" for 3 + 8). Those are locked in below. The remaining templates whose
 * params are not the prompt's operands at all (bridge_add, tens_and_ones_*,
 * two_step_*, think_sum: 13 of them) are left out rather than given a rule that
 * happens to pass today.
 */
const SAME_ORDER = new Set([
    "math.prompt.word.birds_land",
    "math.prompt.word.birds_fly",
    "math.prompt.word.berries_find",
    "math.prompt.word.berries_eat",
    "math.prompt.word.nests_eggs",
    "math.prompt.word.berries_shared",
        "math.hint.count_on",
        "math.expl.add",
        "math.hint.count_back",
        "math.expl.sub",
        "math.hint.groups",
        "math.expl.mul",
        "math.hint.share",
        "math.expl.div",
        "math.expl.add_x",
        "math.expl.sub_x",
        "math.hint.count_on_run",
        "math.hint.count_on_reach",
        "math.hint.count_on_run_x",
        "math.hint.count_on_x",
        "math.hint.next_number",
        "math.hint.take_away_count_back",
        "math.hint.take_away_think",
        "math.hint.take_away_how_many",
        "math.hint.how_many_fit",
        "math.hint.count_one_more",
        "math.hint.count_just_more",
        "math.hint.take_away_half",
        "math.hint.count_up_more",
        "math.hint.count_back_more",
        "math.hint.groups_makes",
        "math.hint.how_many_make",
        "math.hint.count_on_and_run_x",
        "math.hint.hold_up_fingers",
        "math.hint.one_hand_other",
        "math.expl.add_zero_same",
        "math.expl.add_double",
        "math.hint.one_more_than_ten",
        "math.hint.best_friends",
        "math.hint.fingers_down",
        "math.hint.take_away_count_left",
        "math.hint.take_away_count_back_one",
        "math.expl.sub_half",
        "math.hint.count_fingers_more",
        "math.hint.start_fingers_put_down",
        "math.hint.start_take_away",
        "math.hint.count_fingers_then",
        "math.hint.take_from",
        "math.hint.split_equal",
        "math.hint.zero_nothing_just",
        "math.expl.zero_nothing",
        "math.expl.zero_still",
        "math.expl.zero_any",
        "math.expl.still",
        "math.hint.full_hand_plus",
        "math.hint.fingers_plus_hand",
        "math.expl.all_fingers",
        "math.hint.just_away_from",
        "math.hint.ten_plus_easy",
        "math.hint.count_on_reach_one",
        "math.hint.take_away_just_left",
        "math.hint.take_away_almost_just",
        "math.hint.take_away_almost",
        "math.expl.sub_just",
        "math.hint.take_away_zero",
        "math.hint.count_back_reach"
    ]);

const COMMUTED_ORDER = new Set([
    // Deliberately starts from the larger operand.
    'math.hint.bigger_first',
    'math.hint.bigger_first_add',
]);

const OPERAND_PAIR = /(\d+)\s*([+\-*/×÷])\s*(\d+)/;

/** The operands as the problem itself poses them, or null. */
function promptOperands(problem) {
    const m = OPERAND_PAIR.exec(problem?.prompt?.text ?? '');
    return m ? [Number(m[1]), Number(m[3])] : null;
}

function checkOrder(key, params, problem) {
    const same = SAME_ORDER.has(key);
    if (!same && !COMMUTED_ORDER.has(key)) return null;
    if (typeof params?.a !== 'number' || typeof params?.b !== 'number') return null;
    const operands = promptOperands(problem);
    if (!operands) return null;
    const [x, y] = same ? operands : [operands[1], operands[0]];
    if (params.a === x && params.b === y) return null;
    return `{a},{b} = ${params.a},${params.b} but the prompt poses `
        + `${operands[0]},${operands[1]}${same ? '' : ' (expected commuted)'}`;
}

/**
 * Verify a derived phrasing against the problem it came from. Recurses through
 * `wrap.*` so a prefixed prompt is checked on its inner phrasing.
 *
 * Returns null when satisfied, a message when not, and undefined when this key
 * has neither an answer verifier nor an order invariant -- so the caller can
 * report the gap instead of counting it as a pass.
 */
export function verify(key, params, problem) {
    if (key.startsWith('math.prompt.wrap.')) {
        const inner = params?.inner;
        if (inner && typeof inner === 'object') return verify(inner.key, inner.params, problem);
        return null;
    }
    const check = SEMANTICS[key];
    const hasOrder = SAME_ORDER.has(key) || COMMUTED_ORDER.has(key);
    if (!check && !hasOrder) return undefined;
    try {
        return (check ? check(params, problem) : null) ?? checkOrder(key, params, problem);
    } catch (err) {
        return `verifier threw: ${err instanceof Error ? err.message : String(err)}`;
    }
}
