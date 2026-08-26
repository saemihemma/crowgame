#!/usr/bin/env node
/**
 * Generate the cinematic art the promptbook declares.
 *
 * brand/ART_PROMPTBOOK.md IS the config: this tool parses its ```art blocks and
 * calls the OpenAI image API. There is no second copy of the prompts, so the
 * document a human reads and the bytes that get sent cannot drift apart.
 *
 * The consistency strategy is in the promptbook §1 and the important half of it
 * is not here: characters are generated ONCE and then composited into every
 * plate by tools/compose_plates.mjs. No amount of prompting makes an image model
 * draw the same crow twice, so this tool's job is to produce good cut-outs and
 * the compositor's job is to reuse them exactly.
 *
 * Two things this does that matter:
 *
 *  - THE STYLE IS INJECTED AROUND THE SUBJECT, never copied into it. The short
 *    ```stylelead goes in front and the long ```styletail goes behind, so the
 *    per-image subject sits between them. Order matters more than wording here:
 *    the first version prepended one 770-character block and the subject landed
 *    so far down the prompt that the house style outranked it. Injecting also
 *    means someone editing one prompt cannot drop the style from one image.
 *
 *  - IT IS IDEMPOTENT. Beside every output sits a .meta.json holding a hash of
 *    the exact request that produced it. Re-running costs nothing and only the
 *    blocks whose prompts actually changed get regenerated.
 *
 * Run:
 *   node tools/gen_art.mjs --plan          # no key needed, prints cost estimate
 *   OPENAI_API_KEY=sk-... node tools/gen_art.mjs
 *   OPENAI_API_KEY=sk-... node tools/gen_art.mjs --only char.hormann --force
 */
import { createHash } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BOOK = join(ROOT, 'brand/ART_PROMPTBOOK.md');
const OUT_DIR = join(ROOT, 'ai_assets/art');
const API = 'https://api.openai.com/v1';
const MODEL = 'gpt-image-1';

// Rough per-image rates, only used for the --plan estimate. VERIFY AGAINST
// CURRENT OPENAI PRICING before trusting the number this prints; these move.
const RATE_USD = { low: 0.02, medium: 0.07, high: 0.19 };
// A 1536x1024 image costs more than a square one. Also an estimate.
const WIDE_MULTIPLIER = 1.5;

const args = process.argv.slice(2);
const PLAN = args.includes('--plan') || args.includes('--dry-run');
const FORCE = args.includes('--force');
const ONLY = (() => {
    const i = args.indexOf('--only');
    return i >= 0 ? args[i + 1] : null;
})();

// ── parse the promptbook ────────────────────────────────────────────────────

/** Every fenced block of a given language, in document order. */
function fences(md, lang) {
    const out = [];
    const re = new RegExp('^```' + lang + '\\n([\\s\\S]*?)^```', 'gm');
    let m;
    while ((m = re.exec(md)) !== null) out.push(m[1]);
    return out;
}

/** `key: value` lines, then `---`, then the prompt body. */
function parseBlock(text) {
    const split = text.indexOf('\n---\n');
    if (split < 0) throw new Error(`art block has no --- separator:\n${text.slice(0, 120)}`);
    const head = text.slice(0, split);
    const prompt = text.slice(split + 5).trim();
    const spec = {};
    for (const line of head.split('\n')) {
        const t = line.trim();
        if (!t) continue;
        const c = t.indexOf(':');
        if (c < 0) throw new Error(`art block header line is not key: value -> ${t}`);
        const key = t.slice(0, c).trim();
        let value = t.slice(c + 1).trim();
        if (value.startsWith('[') && value.endsWith(']')) {
            value = value.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
        }
        spec[key] = value;
    }
    return { ...spec, prompt };
}

function loadBook() {
    const md = readFileSync(BOOK, 'utf8');
    const one = (lang) => {
        const f = fences(md, lang);
        if (f.length !== 1) throw new Error(`expected exactly one \`\`\`${lang} block, found ${f.length}`);
        return f[0].trim();
    };
    const style = { lead: one('stylelead'), tail: one('styletail') };
    const blocks = fences(md, 'art').map(parseBlock);

    const seen = new Set();
    for (const b of blocks) {
        if (!b.id) throw new Error('an art block has no id');
        if (seen.has(b.id)) throw new Error(`duplicate art block id: ${b.id}`);
        seen.add(b.id);
        if (!b.prompt) throw new Error(`${b.id}: empty prompt`);
        if (b.background === 'transparent' && b.kind === 'plate')
            throw new Error(`${b.id}: a plate is the opaque bottom of a shot; it cannot be transparent`);
    }
    return { style, blocks };
}

const outPath = (id) => join(OUT_DIR, `${id}.png`);
const metaPath = (id) => join(OUT_DIR, `${id}.meta.json`);

/**
 * A reference is either another block's id, or `ref:<path>` for real art already
 * in the repo -- the crow sprite, a gameplay screenshot. The second kind is what
 * anchors generated art to what the game actually looks like.
 */
function refPath(ref, byId) {
    if (ref.startsWith('ref:')) {
        const p = join(ROOT, ref.slice(4));
        if (!existsSync(p)) throw new Error(`reference file not found: ${ref}`);
        return p;
    }
    if (!byId.has(ref)) throw new Error(`unknown reference id: ${ref}`);
    return outPath(ref);
}

function buildRequest(block, style, byId) {
    const refs = Array.isArray(block.refs) ? block.refs : block.refs ? [block.refs] : [];
    const prompt = `${style.lead}\n\n${block.prompt}\n\n${style.tail}`;
    const req = {
        id: block.id,
        prompt,
        size: block.size ?? '1024x1024',
        quality: block.quality ?? 'medium',
        background: block.background === 'transparent' ? 'transparent' : 'opaque',
        refs,
    };
    // The hash covers everything that changes the bytes, so editing a prompt
    // invalidates exactly one image and nothing else.
    req.hash = createHash('sha256')
        .update(JSON.stringify([MODEL, req.prompt, req.size, req.quality, req.background, req.refs]))
        .digest('hex')
        .slice(0, 16);
    return req;
}

function isStale(req) {
    if (FORCE) return true;
    if (!existsSync(outPath(req.id))) return true;
    if (!existsSync(metaPath(req.id))) return true;
    try {
        return JSON.parse(readFileSync(metaPath(req.id), 'utf8')).hash !== req.hash;
    } catch {
        return true;
    }
}

function estimate(req) {
    const base = RATE_USD[req.quality] ?? RATE_USD.medium;
    return req.size === '1024x1024' ? base : base * WIDE_MULTIPLIER;
}

// ── the API ─────────────────────────────────────────────────────────────────

async function callOpenAI(req, byId, key) {
    const headers = { Authorization: `Bearer ${key}` };
    let res;

    if (req.refs.length === 0) {
        res = await fetch(`${API}/images/generations`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL,
                prompt: req.prompt,
                size: req.size,
                quality: req.quality,
                background: req.background,
                output_format: 'png',
                n: 1,
            }),
        });
    } else {
        // The edits endpoint is how a reference image gets in. Multiple images
        // are allowed; the first is the strongest influence, so the style anchor
        // or the character's own base image goes first in `refs`.
        const form = new FormData();
        form.append('model', MODEL);
        form.append('prompt', req.prompt);
        form.append('size', req.size);
        form.append('quality', req.quality);
        form.append('background', req.background);
        form.append('output_format', 'png');
        form.append('input_fidelity', 'high');
        for (const ref of req.refs) {
            const p = refPath(ref, byId);
            if (!existsSync(p))
                throw new Error(`${req.id} references ${ref}, which has not been generated yet`);
            const buf = await readFile(p);
            form.append('image[]', new Blob([buf], { type: 'image/png' }), basename(p));
        }
        res = await fetch(`${API}/images/edits`, { method: 'POST', headers, body: form });
    }

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`${req.id}: OpenAI ${res.status} — ${body.slice(0, 400)}`);
    }
    const json = await res.json();
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) throw new Error(`${req.id}: response carried no image`);
    return Buffer.from(b64, 'base64');
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
    const { style, blocks } = loadBook();
    const byId = new Map(blocks.map((b) => [b.id, b]));

    let requests = blocks.map((b) => buildRequest(b, style, byId));
    if (ONLY) requests = requests.filter((r) => r.id.startsWith(ONLY));
    if (requests.length === 0) {
        console.error(ONLY ? `no block id starts with "${ONLY}"` : 'the promptbook declares no art');
        process.exit(1);
    }

    const stale = requests.filter(isStale);
    const fresh = requests.length - stale.length;

    console.log(`promptbook: ${blocks.length} blocks, ${requests.length} selected, ${fresh} already current`);

    if (stale.length === 0) {
        console.log('nothing to generate. Use --force to regenerate anyway.');
        return;
    }

    const cost = stale.reduce((a, r) => a + estimate(r), 0);
    console.log(`\nwould generate ${stale.length}:`);
    for (const r of stale) {
        const refs = r.refs.length ? `  <- ${r.refs.join(', ')}` : '';
        console.log(`  ${r.id.padEnd(24)} ${r.size} ${r.quality.padEnd(6)} ${r.background}${refs}`);
    }
    console.log(`\nrough estimate: $${cost.toFixed(2)} (verify the rates in this file against current OpenAI pricing)`);

    if (PLAN) {
        console.log('\n--plan: nothing was sent and nothing was written.');
        return;
    }

    const key = process.env.OPENAI_API_KEY;
    if (!key) {
        console.error('\nOPENAI_API_KEY is not set. Use --plan to see the plan without a key.');
        process.exit(1);
    }

    await mkdir(OUT_DIR, { recursive: true });
    // Sequential on purpose: later blocks reference earlier outputs (a pose
    // references its character's base image), so the order in the document is a
    // dependency order and parallelising it would race.
    let done = 0;
    for (const req of stale) {
        process.stdout.write(`  ${req.id} ... `);
        const png = await callOpenAI(req, byId, key);
        await writeFile(outPath(req.id), png);
        await writeFile(metaPath(req.id), JSON.stringify({
            id: req.id, hash: req.hash, model: MODEL,
            size: req.size, quality: req.quality, background: req.background, refs: req.refs,
        }, null, 2) + '\n');
        done++;
        console.log(`${(png.length / 1024).toFixed(0)} KB`);
    }

    console.log(`\n${done} written to ai_assets/art/. Look at them before composing:`);
    console.log('  npm run art:compose');
}

main().catch((err) => {
    console.error(`\n${err.message}`);
    process.exit(1);
});
