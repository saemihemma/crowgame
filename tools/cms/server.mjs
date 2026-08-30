#!/usr/bin/env node
/**
 * The localisation & component CMS: `npm run cms`, then http://127.0.0.1:4173/ (or /cms, /admin/cms)
 *
 * Edits here write directly to godot/data/i18n/*.json and tools/math_phrasing_catalog.mjs.
 * Every edit runs tools/validate_i18n.mjs and rolls back if invalid.
 * Includes direct Git integration so changes can be committed to the repo with 1 click.
 */
import { createServer } from 'http';
import { readFileSync, writeFileSync, existsSync } from 'fs';
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

function getGitPath() {
    const candidates = [
        'git',
        join(process.env.LOCALAPPDATA ?? '', 'Programs/Git/cmd/git.exe'),
        'C:\\Program Files\\Git\\cmd\\git.exe',
        'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
    ];
    for (const c of candidates) {
        if (c !== 'git' && existsSync(c)) return c;
    }
    return 'git';
}

function execPromise(cmd, args, cwd = ROOT) {
    return new Promise(done => {
        execFile(cmd, args, { cwd, maxBuffer: 8 << 20 }, (err, stdout, stderr) => {
            done({ code: err ? (err.code || 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') });
        });
    });
}

/** Run the shipped guard over the tree as it stands right now. */
async function validate() {
    const res = await execPromise(process.execPath, [VALIDATOR]);
    return { ok: res.code === 0, output: `${res.stdout}${res.stderr}`.trim() };
}

/** What the working tree is carrying that HEAD is not, for the two bundles. */
async function diffStat() {
    const git = getGitPath();
    const res = await execPromise(git, ['diff', '--numstat', '--', BUNDLE_DIR]);
    if (res.code !== 0) return null;
    const lines = res.stdout.trim().split('\n').filter(Boolean);
    let added = 0;
    for (const line of lines) added += Number(line.split('\t')[0]) || 0;
    return { files: lines.length, lines: added };
}

/** Get full git status info */
async function gitStatus() {
    const git = getGitPath();
    const branchRes = await execPromise(git, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const statusRes = await execPromise(git, ['status', '--porcelain', '--', BUNDLE_DIR, 'tools/math_phrasing_catalog.mjs']);
    const logRes = await execPromise(git, ['log', '-1', '--oneline']);

    const branch = branchRes.stdout.trim() || 'unknown';
    const changedLines = statusRes.stdout.trim().split('\n').filter(Boolean);
    const lastCommit = logRes.stdout.trim() || '';

    return {
        branch,
        dirty: changedLines.length > 0,
        changedFiles: changedLines.map(l => l.trim()),
        lastCommit,
    };
}

/** Commit CMS edits directly to git */
async function gitCommit(message) {
    const git = getGitPath();
    const commitMsg = message && message.trim() ? message.trim() : 'cms: update localization and components';
    await execPromise(git, ['add', BUNDLE_DIR, 'tools/math_phrasing_catalog.mjs']);
    const commitRes = await execPromise(git, ['commit', '-m', commitMsg]);
    const status = await gitStatus();
    return {
        ok: commitRes.code === 0,
        output: (commitRes.stdout || commitRes.stderr).trim(),
        git: status,
    };
}

/**
 * Write one key, then prove the tree is still valid.
 */
async function writeKey({ key, locale, value }) {
    if (!LOCALES.includes(locale)) return { ok: false, error: `unknown locale '${locale}'` };
    if (typeof key !== 'string' || key === '') return { ok: false, error: 'missing key' };
    if (typeof value !== 'string') return { ok: false, error: 'value must be a string' };

    const path = bundlePath(locale);
    const before = readFileSync(path, 'utf8');
    const bundle = JSON.parse(before);
    if (!(key in bundle)) return { ok: false, error: `'${key}' is not in strings_${locale}.json` };
    if (bundle[key] === value) return { ok: true, unchanged: true, ...(await validate()), git: await gitStatus() };

    bundle[key] = value;
    writeFileSync(path, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');

    const result = await validate();
    if (!result.ok) {
        writeFileSync(path, before, 'utf8');
        return { ok: false, reverted: true, error: result.output };
    }
    return { ok: true, output: result.output, diff: await diffStat(), git: await gitStatus() };
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
        if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/cms' || url.pathname === '/admin')) {
            res.writeHead(302, { location: '/admin/cms' });
            return res.end();
        }
        if (req.method === 'GET' && url.pathname === '/admin/cms') {
            return send(res, 200, PAGE, 'text/html; charset=utf-8');
        }
        if (req.method === 'GET' && url.pathname === '/api/model') {
            return send(res, 200, { ...buildModel(ROOT), diff: await diffStat(), git: await gitStatus() });
        }
        if (req.method === 'GET' && url.pathname === '/api/validate') {
            return send(res, 200, await validate());
        }
        if (req.method === 'GET' && url.pathname === '/api/git/status') {
            return send(res, 200, await gitStatus());
        }
        if (req.method === 'POST' && url.pathname === '/api/git/commit') {
            const body = await readJson(req);
            const result = await gitCommit(body.message);
            return send(res, result.ok ? 200 : 400, result);
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
    console.log(`Hörmann CMS  ->  http://${HOST}:${PORT}/ (and /cms, /admin/cms)`);
    console.log(
        `  ${totals.keys} phrases covering ${totals.problemsCovered} problem renderings` +
        `${untranslated > 0 ? `, ${untranslated} still reading as English` : ', all translated'}`,
    );
    console.log(`  every save runs ${VALIDATOR} and validates immediately`);
    console.log(`  Git-backed: edits update working tree and can be committed via UI or CLI`);
});
