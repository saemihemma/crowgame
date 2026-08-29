/**
 * What the localisation CMS knows: every key a child can read, what it costs to
 * change, and a real sentence to check it against.
 *
 * The engine this sits on top of already exists and is the good part. Roughly
 * 8200 English sentences across 4200 problems collapse into a few hundred
 * templates, because the numbers are parameters and the wording repeats -- so
 * translating Hörmann is not 4200 pieces of work, it is a few hundred. That has
 * been true for a while. What was missing was any way to SEE it: the only
 * editing surface was a 53KB JSON file, where `math.hint.count_back` looks
 * exactly as important as a key used once, and nothing tells you that editing it
 * rewrites 905 problems at a stroke.
 *
 * So the job of this module is to turn the bundles into rows that carry their
 * own weight:
 *
 *   uses     how many problems render this key. The reuse number, made visible.
 *   sample   real parameters from a real problem, so the preview is a sentence
 *            a child will actually see rather than "{a} + {b}".
 *   locked   whether English may be edited here at all -- see below.
 *   plural   the `.one` sibling, carried with its base rather than filed 300
 *            rows away under its own alphabetical spot.
 *
 * WHY SOME ENGLISH IS READ-ONLY
 * -----------------------------
 * The English side of every `math.*` phrasing is GENERATED from
 * tools/math_phrasing_catalog.mjs by tools/sync_math_phrasing_bundles.mjs. The
 * catalog is also what the derivation parses against, and every one of the 11518
 * derivations is round-tripped through it and must reproduce the original
 * problem string exactly. Edit that English in the bundle and two things happen:
 * `npm run math:phrasing` silently puts it back, and if it did not, the round
 * trip would start failing. So the CMS shows it and refuses to write it, with
 * the reason attached to the row rather than in a wiki nobody opens.
 *
 * Icelandic is hand-authored for every key, including those, and is fully
 * editable. That asymmetry is the whole point: English is derived from the
 * problems, Icelandic is written by a person.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { TEMPLATES, PLURAL_PARAM, render, hasWords } from '../math_phrasing_catalog.mjs';

export const LOCALES = ['en', 'is'];
export const BUNDLE_DIR = 'godot/data/i18n';

/** The math pools, in the order the game consults them. */
const POOLS = [
    'godot/data/math/problems_easy.json',
    'godot/data/math/problems_dataset.json',
    'godot/data/math/problems_gaps.json',
    'godot/data/math/problems_curriculum.json',
];

/**
 * Where a key comes from, which is what decides whether it can be edited and
 * what it should be checked against.
 *
 * Ordered from most-constrained to least, and matched in order, so
 * `math.prompt.*` is classified before the looser `math.*` catch-all.
 */
const GROUPS = [
    {
        id: 'prompt',
        label: 'Questions',
        prefix: 'math.prompt.',
        blurb: 'The question itself. One template here is every problem that asks it.',
    },
    {
        id: 'hint',
        label: 'Hints',
        prefix: 'math.hint.',
        blurb: 'The nudge an owl gives when a child asks for help.',
    },
    {
        id: 'explanation',
        label: 'Explanations',
        prefix: 'math.expl.',
        blurb: 'What is said after an answer. A miss ends here, so this is the teaching one.',
    },
    {
        id: 'wrap',
        label: 'Question prefixes',
        prefix: 'math.wrap.',
        blurb: 'Lead-ins wrapped around another question, so 8 leads x 8 prefixes cost 15 strings rather than 64.',
    },
    {
        id: 'miss',
        label: 'Misconceptions',
        prefix: 'math.miss.',
        blurb: 'Named for a specific wrong answer, so the reply speaks to the mistake actually made.',
    },
    {
        id: 'lesson',
        label: 'Lessons',
        prefix: 'tutorial.',
        blurb: 'The concept lessons. Held to a reading budget the validator enforces.',
    },
    {
        id: 'math_ui',
        label: 'Owl encounter',
        prefix: 'math.',
        blurb: 'Everything else the owl says: greetings, praise, the step-up banner.',
    },
    {
        id: 'ui',
        label: 'Screens and menus',
        prefix: '',
        blurb: 'Menus, the level select, the login, the parent report.',
    },
];

const groupFor = key => GROUPS.find(g => key.startsWith(g.prefix)) ?? GROUPS[GROUPS.length - 1];

/**
 * Every English key whose value is generated rather than written.
 *
 * Taken from the catalog itself rather than from a prefix, so a `math.*` key
 * that is genuinely hand-authored (the greetings, the step-up banner) stays
 * editable while the derived phrasings do not.
 */
const generatedEnglish = new Set(Object.keys(TEMPLATES));

/** The `.one` keys are shown with their base, not as rows of their own. */
const isPluralVariant = key => key.endsWith('.one') && PLURAL_PARAM[key.slice(0, -4)] !== undefined;

export function readBundle(root, locale) {
    return JSON.parse(readFileSync(join(root, BUNDLE_DIR, `strings_${locale}.json`), 'utf8'));
}

/**
 * Walk the problem pools once and record, per phrasing key, how many problems
 * use it and what one of them passes in.
 *
 * The sample is the FIRST use rather than a random or representative one,
 * deliberately: a preview that changes between page loads is a preview you
 * cannot compare against what you saw a minute ago.
 */
function usageFromPools(root) {
    const uses = new Map();
    const sample = new Map();
    const note = (ref) => {
        if (!ref || typeof ref.key !== 'string') return;
        uses.set(ref.key, (uses.get(ref.key) ?? 0) + 1);
        if (!sample.has(ref.key)) sample.set(ref.key, ref.params ?? {});
        // A nested prefix carries a whole second phrasing as a parameter, and it
        // is used exactly as much as the wrapper it sits inside.
        if (ref.params && typeof ref.params.inner === 'object') note(ref.params.inner);
    };
    for (const pool of POOLS) {
        let problems;
        try {
            problems = JSON.parse(readFileSync(join(root, pool), 'utf8')).problems ?? [];
        } catch {
            continue; // a pool that is not in the tree is not an error here
        }
        for (const p of problems) {
            const phrasing = p.phrasing;
            if (!phrasing) continue;
            note(phrasing.prompt);
            note(phrasing.hint);
            note(phrasing.explanation);
        }
    }
    return { uses, sample };
}

/**
 * Render one key in one locale, using that locale's own bundle as the template
 * set so a preview shows what the game would show -- including the fallback to
 * English that TextManager.tp() performs for a key the locale is missing.
 */
function preview(key, params, bundle, locale, fallback) {
    const templates = { ...fallback, ...bundle };
    try {
        return render(key, params ?? {}, templates, locale);
    } catch {
        return null;
    }
}

/**
 * The whole editable surface, as rows.
 *
 * One row per key, carrying both locales, so the CMS never has to hold two
 * parallel lists in agreement -- the shape that let the bundles drift in the
 * first place is the shape this deliberately does not have.
 */
export function buildModel(root) {
    const en = readBundle(root, 'en');
    const is = readBundle(root, 'is');
    const { uses, sample } = usageFromPools(root);

    const rows = [];
    for (const key of Object.keys(en)) {
        if (isPluralVariant(key)) continue;
        const group = groupFor(key);
        const params = sample.get(key) ?? null;
        const pluralOf = PLURAL_PARAM[key];
        const variant = pluralOf === undefined ? null : `${key}.one`;
        rows.push({
            key,
            group: group.id,
            en: en[key] ?? '',
            is: is[key] ?? '',
            // Uses is 0 for anything not driven by a problem -- menus, lessons,
            // the owl's greetings. That is information, not a gap: it means the
            // preview below is the string itself and there is nothing to sample.
            uses: uses.get(key) ?? 0,
            sample: params,
            enPreview: params ? preview(key, params, en, 'en', en) : en[key] ?? '',
            isPreview: params ? preview(key, params, is, 'is', en) : is[key] ?? '',
            // English is read-only wherever it is generated from the catalog.
            lockedEn: generatedEnglish.has(key),
            // The number a plural key inflects on, so the editor can say WHICH
            // number decides between the two forms rather than leaving a
            // translator to guess.
            pluralOn: pluralOf ?? null,
            variant: variant === null ? null : {
                key: variant,
                en: en[variant] ?? '',
                is: is[variant] ?? '',
                lockedEn: generatedEnglish.has(variant),
            },
            // A key with no letters on either side needs no translation and is
            // shown greyed rather than hidden: "x{0}" being identical in both
            // locales is correct, and a translator should be able to see that it
            // was a decision rather than an omission.
            translatable: hasWords(en[key]) || hasWords(is[key]),
        });
    }

    rows.sort((a, b) => b.uses - a.uses || a.key.localeCompare(b.key));
    return {
        groups: GROUPS.map(g => ({
            id: g.id,
            label: g.label,
            blurb: g.blurb,
            count: rows.filter(r => r.group === g.id).length,
        })).filter(g => g.count > 0),
        rows,
        totals: {
            keys: rows.length,
            problemsCovered: [...uses.values()].reduce((a, b) => a + b, 0),
            locales: LOCALES.length,
        },
    };
}
