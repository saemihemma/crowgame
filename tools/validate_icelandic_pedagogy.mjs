#!/usr/bin/env node
/**
 * Icelandic Pedagogical & Linguistic Guard (1. Bekkur Standard)
 *
 * Enforces native early-childhood Icelandic math teaching standards:
 *  1. No bureaucratic English calques ("hversu mörg", "hversu margir").
 *  2. No negative adult meta-instructions ("þú þarft ekki að...").
 *  3. No abstract pseudo-physics ("ramminn heldur þeim kyrrum").
 *  4. No broken word-for-word calques ("hvað marga kassa" -> "hvað þarftu marga kassa").
 *  5. Proper arithmetic comparison terminology ("stærri/minni", not "hærri/lægri").
 *  6. Concrete manipulative naming ("tíurammi", "fimm-rammi", "talnalína").
 *  7. Valid Icelandic question and sentence punctuation.
 *
 * Run: node tools/validate_icelandic_pedagogy.mjs
 */
import { readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IS_STRINGS_PATH = join(ROOT, 'godot', 'data', 'i18n', 'strings_is.json');
const isStrings = JSON.parse(readFileSync(IS_STRINGS_PATH, 'utf8'));

const BANNED_PATTERNS = [
    {
        regex: /\bhversu\b/i,
        reason: "Banned calque: 'hversu' is bureaucratic/formal. Use 'Hvað eru mörg?', 'Hvað sérðu mörg?', 'Hvað eru margir?'."
    },
    {
        regex: /\bþarft ekki\b/i,
        reason: "Banned negative meta-instruction: Tell the child directly what to do (e.g. 'Byrjaðu á fimm og teldu áfram')."
    },
    {
        regex: /\bheldur þeim kyrr/i,
        reason: "Banned abstract calque: 'heldur þeim kyrrum'. Ground in the manipulative ('Í fimm-rammanum...')."
    },
    {
        regex: /\bsitur kyrr\b/i,
        reason: "Banned calque: Use 'breytist ekki' or action verbs instead of 'situr kyrr'."
    },
    {
        regex: /\bhvað marga\b/i,
        reason: "Banned broken calque: 'Hvað marga...' is a broken calque of 'How many...'. Use 'Hvað þarftu marga...' or 'Hvað eru margir...'."
    },
    {
        regex: /\bhvað mörg í byrjun\b/i,
        reason: "Banned broken calque: Use 'Hvað voru mörg í byrjun?'."
    },
    {
        regex: /\bhvað var margt í byrjun\b/i,
        reason: "Banned broken calque: Use 'Hvað var mikið í byrjun?' or 'Hvað voru mörg í byrjun?'."
    },
    {
        regex: /\b(hærri|lægri)\s+tala\b/i,
        reason: "Banned math term: Numbers have magnitude, not height. Use 'stærri tala' or 'minni tala'."
    },
    {
        regex: /\b(hærri|lægri)\s+tölu\b/i,
        reason: "Banned math term: Use 'stærri tölu' or 'minni tölu'."
    },
    {
        regex: /\b(hærra|lægra)\s+gildi\b/i,
        reason: "Banned abstract term for 6yo: Use 'hvor talan er stærri'."
    },
    {
        regex: /\bfullur rammi\b(?!.*tíu)/i,
        reason: "Ungrounded manipulative: Specify 'tíurammi' or 'fimm-rammi'."
    },
    {
        regex: /\b(?:ekkert er talið|talan segir hvað)\b/i,
        reason: "Banned detached theory: Avoid university-level definitions of cardinality."
    }
];

const issues = [];

for (const [key, text] of Object.entries(isStrings)) {
    if (typeof text !== 'string') continue;
    
    for (const pattern of BANNED_PATTERNS) {
        if (pattern.regex.test(text)) {
            issues.push({
                key,
                text,
                reason: pattern.reason,
                match: text.match(pattern.regex)[0]
            });
        }
    }
    
    // Check missing punctuation on tutorial cards and prompts
    if (key.startsWith('tutorial.') || key.startsWith('math.prompt.')) {
        if (!key.endsWith('.title') && !key.endsWith('.back') && !key.endsWith('.next') && !key.endsWith('.skip') && !key.endsWith('.start')) {
            const trimmed = text.trim();
            if (!trimmed.endsWith('.') && !trimmed.endsWith('?') && !trimmed.endsWith('!') && !trimmed.includes('{glyphs}') && !trimmed.includes('{seq}') && !trimmed.includes('{inner}') && !trimmed.includes('{b}') && !trimmed.includes('{op}')) {
                issues.push({
                    key,
                    text,
                    reason: "Missing terminal punctuation (must end in '.', '?', or '!')"
                });
            }
        }
    }
}

console.log('================================================================');
console.log('       ICELANDIC PEDAGOGICAL & LINGUISTIC GUARD                 ');
console.log('================================================================');
console.log(`Total Keys Scanned: ${Object.keys(isStrings).length}`);
console.log(`Issues / Anti-Patterns Found: ${issues.length}`);
console.log('----------------------------------------------------------------');

if (issues.length > 0) {
    console.log('\n--- DETECTED PEDAGOGICAL DEFECTS ---');
    for (const issue of issues) {
        console.log(`\n[${issue.key}]`);
        console.log(`  Text:   "${issue.text}"`);
        console.log(`  Reason: ${issue.reason}`);
    }
    process.exit(1);
} else {
    console.log('\n[PASS] All Icelandic strings adhere to native 1. Bekkur pedagogical standards!');
    process.exit(0);
}
