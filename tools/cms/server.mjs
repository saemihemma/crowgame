#!/usr/bin/env node
/**
 * The localisation CMS: `npm run cms`, then http://127.0.0.1:4173/admin/cms
 *
 * WHY THIS IS A LOCAL TOOL AND NOT A ROUTE ON THE API
 * --------------------------------------------------
 * The obvious place for an admin CMS is beside the owner's dashboard in
 * server/src/admin/. It is the wrong place, for three reasons that all point the
 * same way:
 *
 * 1. THE GUARDS. tools/validate_i18n.mjs is what makes this translation
 *    trustworthy: EN/IS lockstep, placeholder parity, the Latin-1 glyph
 *    allowlist that keeps Godot's font from drawing tofu, and a pixel fit budget
 *    that catches a translation too long for the box it lands in. It runs in
 *    330ms, so this server runs THE REAL ONE on every save rather than
 *    approximating it. A CMS on the deployed API could not: the API image ships
 *    tsc output, not the game's data files, the pools, or the catalog.
 *
 * 2. THE BLAST RADIUS. An in-game string editor already existed once and was
 *    deliberately deleted (see text_manager.gd) because a live editor on a
 *    shared family device lets anyone rewrite what a child reads. A server-side
 *    editor writing runtime overrides is a smaller version of the same thing: it
 *    would push unreviewed strings straight into a running game, past every
 *    guard above.
 *
 * 3. THE ARTEFACT. Edits here are edits to godot/data/i18n/*.json -- ordinary
 *    files, so an edit is a git diff. It can be read, reviewed, reverted, and it
 *    goes out with a build like every other change. Nothing about the game
 *    becomes dependent on a database being up, and the game stays offline-first.
 *
 * So: edit here, watch the guard pass, `git diff` to see what you changed,
 * commit, and the next `npm run web:build` carries it. That is the whole
 * delivery path, and it has no new moving parts in it.
 *
 * Bound to 127.0.0.1 on purpose. It writes to the working tree and has no auth,
 * which is safe for a tool on a developer's own machine and is not safe for
 * anything else. It is under tools/, which never ships.
 */
import { createServer } from 'http';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { buildModel, readBundle, LOCALES, BUNDLE_DIR } from './model.mjs';
import { PAGE } from './page.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.CMS_PORT ?? 4173);
const HOST = '127.0.0.1';
const VALIDATOR = 'tools/validate_i18n.mjs';

const bundlePath = locale => join(ROOT, BUNDLE_DIR, `strings_${locale}.json`);

/** Run the shipped guard over the tree as it stands right now. */
function validate() {
    return new Promise(done => {
        execFile('node', [VALIDATOR], { cwd: ROOT, maxBuffer: 8 << 20 }, (err, stdout, stderr) => {
            done({ ok: !err, output: `${stdout}${stderr}`.trim() });
        });
    });
}

/** What the working tree is carrying that HEAD is not, for the two bundles. */
function diffStat() {
    return new Promise(done => {
        execFile('git', ['diff', '--numstat', '--', BUNDLE_DIR], { cwd: ROOT }, (err, stdout) => {
            if (err) return done(null);
            const lines = stdout.trim().split('\n').filter(Boolean);
            let added = 0;
            for (const line of lines) added += Number(line.split('\t')[0]) || 0;
            done({ files: lines.length, lines: added });
        });
    });
}

/**
 * Write one key, then prove the tree is still valid.
 *
 * Read-modify-write of the whole bundle rather than a patch, so key ORDER is
 * preserved: the English bundle is not sorted (the phrasing sync appends to it),
 * and rewriting it sorted would bury one edited string in a 600-line diff.
 *
 * On a guard failure the file goes back exactly as it was. A CMS that leaves the
 * tree failing CI and tells you about it afterwards is a CMS you have to clean
 * up after, and the whole point of running the real validator on every save is
 * that you never have to.
 */
async function writeKey({ key, locale, value }) {
    if (!LOCALES.includes(locale)) return { ok: false, error: `unknown locale '${locale}'` };
    if (typeof key !== 'string' || key === '') return { ok: false, error: 'missing key' };
    if (typeof value !== 'string') return { ok: false, error: 'value must be a string' };

    const path = bundlePath(locale);
    const before = readFileSync(path, 'utf8');
    const bundle = JSON.parse(before);
    if (!(key in bundle)) return { ok: false, error: `'${key}' is not in strings_${locale}.json` };
    if (bundle[key] === value) return { ok: true, unchanged: true, ...(await validate()) };

    bundle[key] = value;
    writeFileSync(path, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');

    const result = await validate();
    if (!result.ok) {
        writeFileSync(path, before, 'utf8');
        return { ok: false, reverted: true, error: result.output };
    }
    return { ok: true, output: result.output, diff: await diffStat() };
}

const send = (res, code, body, type = 'application/json') => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

function readJson(req) {
    return new Promise((done, fail) => {
        let raw = '';
        req.on('data', c => {
            raw += c;
            if (raw.length > 1 << 20) fail(new Error('body too large'));
        });
        req.on('end', () => {
            try {
                done(JSON.parse(raw || '{}'));
            } catch (e) {
                fail(e);
            }
        });
    });
}

const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${HOST}`);
    try {
        if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/admin')) {
            res.writeHead(302, { location: '/admin/cms' });
            return res.end();
        }
        if (req.method === 'GET' && url.pathname === '/admin/cms') {
            return send(res, 200, PAGE, 'text/html; charset=utf-8');
        }
        if (req.method === 'GET' && url.pathname === '/api/model') {
            return send(res, 200, { ...buildModel(ROOT), diff: await diffStat() });
        }
        if (req.method === 'GET' && url.pathname === '/api/validate') {
            return send(res, 200, await validate());
        }
        if (req.method === 'PUT' && url.pathname === '/api/key') {
            const body = await readJson(req);
            const result = await writeKey(body);
            return send(res, result.ok ? 200 : 422, result);
        }
        return send(res, 404, { error: 'not found' });
    } catch (e) {
        return send(res, 500, { error: String(e && e.message ? e.message : e) });
    }
});

server.listen(PORT, HOST, () => {
    const { rows, totals } = buildModel(ROOT);
    const untranslated = rows.filter(r => r.translatable && r.is === r.en).length;
    console.log(`Hörmann localisation CMS  ->  http://${HOST}:${PORT}/admin/cms`);
    console.log(
        `  ${totals.keys} phrases covering ${totals.problemsCovered} problem renderings` +
        `${untranslated > 0 ? `, ${untranslated} still reading as English` : ', all translated'}`,
    );
    console.log(`  every save runs ${VALIDATOR} and rolls back if it fails`);
});
