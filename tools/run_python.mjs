#!/usr/bin/env node
/**
 * Run a Python script with whatever Python this machine actually calls Python.
 *
 * Usage (from an npm script): node tools/run_python.mjs tools/audit_audio.py [args]
 *
 * WHY THIS EXISTS. `python3` is the right name on macOS and Linux and does not
 * exist on Windows, where the interpreter is `py` (the launcher, installed with
 * every python.org and winget build) or `python`. An npm script hardcoding
 * `python3` is a script that works for whoever wrote it.
 *
 * WINDOWS HAS A TRAP HERE and it is the whole reason this file tries `py` first.
 * A stock Windows carries an "app execution alias" at
 * %LOCALAPPDATA%\\Microsoft\\WindowsApps\\python.exe which is not Python: it is a
 * stub that prints
 *
 *     Python was not found; run without arguments to install from the
 *     Microsoft Store...
 *
 * and exits 9009. It sits early on PATH, so it shadows a perfectly good Python
 * installed by winget. `py` is never shadowed, so it is tried first, and the
 * stub is detected and skipped if it is reached anyway.
 */
import { spawnSync } from 'node:child_process';

const [script, ...args] = process.argv.slice(2);
if (!script) {
    console.error('usage: node tools/run_python.mjs <script.py> [args...]');
    process.exit(2);
}

// `py` first on Windows: it is the launcher, and it is the one name the Store
// alias cannot shadow. `python3` first elsewhere, where `python` may still be 2.
const candidates = process.platform === 'win32'
    ? ['py', 'python3', 'python']
    : ['python3', 'python', 'py'];

/** Is this name the Microsoft Store stub rather than an interpreter? */
function isStoreStub(name) {
    const probe = spawnSync(name, ['-c', 'print(1)'], { encoding: 'utf8' });
    if (probe.error) return true;
    const output = `${probe.stdout ?? ''}${probe.stderr ?? ''}`;
    return probe.status !== 0 || /Microsoft Store|was not found/i.test(output);
}

const found = candidates.find(name => !isStoreStub(name));

if (!found) {
    console.error('No working Python found. Tried: ' + candidates.join(', ') + '\n');
    if (process.platform === 'win32') {
        console.error('  winget install Python.Python.3.12        then open a NEW terminal');
        console.error('');
        console.error('  If `python` prints "Python was not found; run without arguments to');
        console.error('  install from the Microsoft Store", that is the Windows app-execution');
        console.error('  alias shadowing a real install. Either use `py`, or turn the alias off:');
        console.error('  Settings > Apps > Advanced app settings > App execution aliases >');
        console.error('  switch off python.exe and python3.exe.');
    } else {
        console.error('  brew install python    # or your package manager');
    }
    process.exit(1);
}

const run = spawnSync(found, [script, ...args], { stdio: 'inherit' });
process.exit(run.status ?? 1);
