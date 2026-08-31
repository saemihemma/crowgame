/**
 * The CMS page, as one self-contained HTML string.
 */
export const PAGE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Hörmann Localisation & Component CMS</title>
<style>
:root {
  color-scheme: light;
  --page: #f9f9f7; --surface: #fcfcfb; --sunk: #f1f1ed;
  --ink: #0b0b0b; --ink-2: #52514e; --muted: #898781;
  --ring: rgba(11,11,11,0.12); --ring-2: rgba(11,11,11,0.06);
  --accent: #2a78d6; --good: #0ca30c; --warn: #b07800; --bad: #d03b3b;
  --lock: #f4f1e8;
}
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --page: #0d0d0d; --surface: #1a1a19; --sunk: #131312;
    --ink: #fff; --ink-2: #c3c2b7; --muted: #898781;
    --ring: rgba(255,255,255,0.14); --ring-2: rgba(255,255,255,0.06);
    --accent: #6aa8ee; --good: #4bcf6b; --warn: #e0b445; --bad: #ef7676;
    --lock: #221f1a;
  }
}
* { box-sizing: border-box; margin: 0; }
body { background: var(--page); color: var(--ink); font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
a { color: var(--accent); }
code, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

header { position: sticky; top: 0; z-index: 5; background: var(--page); border-bottom: 1px solid var(--ring-2); padding: 14px 20px 0; }
.title { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
h1 { font-size: 18px; font-weight: 650; }
.lede { color: var(--ink-2); font-size: 13px; max-width: 68ch; margin-top: 4px; }
.lede b { color: var(--ink); font-weight: 600; }
.controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 12px 0; }
input[type=search], select { border: 1px solid var(--ring); background: var(--surface); color: var(--ink); border-radius: 8px; padding: 7px 10px; font: inherit; }
input[type=search] { min-width: 240px; flex: 1 1 240px; }
.pill { border: 1px solid var(--ring); background: var(--surface); color: var(--ink-2); border-radius: 999px; padding: 5px 11px; cursor: pointer; font: inherit; font-size: 13px; }
.pill[aria-pressed=true] { background: var(--ink); color: var(--page); border-color: var(--ink); }
.btn-git { background: var(--accent); color: #fff; border: none; border-radius: 8px; padding: 6px 14px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-size: 13px; }
.btn-git:hover { opacity: 0.9; }
.btn-git:disabled { opacity: 0.5; cursor: not-allowed; }
.status { margin-left: auto; font-size: 12px; color: var(--muted); display: flex; align-items: center; gap: 8px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--good); }
.dot.bad { background: var(--bad); }

main { padding: 16px 20px 80px; display: grid; gap: 10px; max-width: 1180px; }
.groupbar { display: flex; gap: 6px; flex-wrap: wrap; padding-bottom: 12px; }

.row { background: var(--surface); border: 1px solid var(--ring-2); border-radius: 12px; padding: 12px 14px; display: grid; gap: 10px; }
.row.dim { opacity: .55; }
.row:focus-within { border-color: var(--ring); }
.rowhead { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.key { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--ink-2); word-break: break-all; }
.uses { font-variant-numeric: tabular-nums; font-size: 12px; font-weight: 600; background: var(--sunk); border-radius: 6px; padding: 2px 8px; white-space: nowrap; }
.uses.hot { background: var(--accent); color: #fff; }
.tag { font-size: 11px; color: var(--muted); border: 1px solid var(--ring-2); border-radius: 6px; padding: 1px 7px; }

.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
@media (max-width: 760px) { .pair { grid-template-columns: 1fr; } }
.field label { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin-bottom: 4px; }
textarea { width: 100%; border: 1px solid var(--ring); background: var(--page); color: var(--ink); border-radius: 8px; padding: 8px 10px; font: inherit; resize: vertical; min-height: 42px; }
textarea:disabled { background: var(--lock); color: var(--ink-2); cursor: not-allowed; }
textarea.err { border-color: var(--bad); }

.preview { background: var(--sunk); border-radius: 8px; padding: 8px 10px; font-size: 13px; display: grid; gap: 3px; }
.preview .line { display: flex; gap: 8px; }
.preview .loc { color: var(--muted); font-size: 11px; text-transform: uppercase; width: 22px; flex: none; padding-top: 2px; }
.preview .txt { color: var(--ink); }
.msg { font-size: 12px; display: none; }
.msg.show { display: block; }
.msg.bad { color: var(--bad); white-space: pre-wrap; font-family: ui-monospace, monospace; font-size: 11px; }
.msg.good { color: var(--good); }
.msg.warn { color: var(--warn); }
.empty { color: var(--muted); padding: 40px 0; text-align: center; }
footer { position: fixed; bottom: 0; left: 0; right: 0; background: var(--surface); border-top: 1px solid var(--ring); padding: 8px 20px; font-size: 12px; color: var(--ink-2); display: flex; gap: 14px; align-items: center; z-index: 10; }
.git-pill { display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; border-radius: 6px; background: var(--sunk); font-weight: 500; }
</style>
</head>
<body>
<header>
  <div class="title">
    <h1>Hörmann Localisation & Component CMS</h1>
    <span class="mono" id="scale" style="color:var(--muted);font-size:12px"></span>
  </div>
  <p class="lede">Every sentence the game says is a <b>template</b>, and numbers are parameters. Edit any string or component below. <b>Every save runs the real i18n guard</b> and writes directly to disk. Use the <b>Commit to Git</b> button to commit your edits so they stay authoritative.</p>
  <div class="controls">
    <input type="search" id="q" placeholder="Search key, English, or Icelandic…" autocomplete="off">
    <button class="pill" id="f-untranslated" aria-pressed="false">Reads as English</button>
    <button class="pill" id="f-used" aria-pressed="false">Used by problems</button>
    <button class="btn-git" id="btn-commit" title="Commit current disk changes to Git">💾 Commit to Git</button>
    <span class="status"><span class="dot" id="dot"></span><span id="status">ready</span></span>
  </div>
  <div class="groupbar" id="groups"></div>
</header>
<main id="rows"><p class="empty">Loading…</p></main>
<footer>
  <span class="git-pill" id="git-branch">🌿 branch: ...</span>
  <span id="diff">no unsaved edits</span>
  <span style="color:var(--muted);margin-left:auto">Edits land in <code>godot/data/i18n/strings_*.json</code> and are version-controlled by Git.</span>
</footer>
<script>
const $ = s => document.querySelector(s);
let MODEL = null;
const state = { q: '', group: null, untranslated: false, used: false };

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const holders = s => [...String(s ?? '').matchAll(/\{([a-z0-9]+)\}/gi)].map(m => m[1]).sort();
const sameHolders = (a, b) => holders(a).join(',') === holders(b).join(',');
const tofu = s => [...String(s ?? '')].filter(c => c.codePointAt(0) > 0xff);

function fill(template, params, bundle) {
  if (params == null) return String(template ?? '');
  return String(template ?? '').replace(/\{([a-z][a-z0-9]*)\}/gi, (whole, name) => {
    const v = params[name];
    if (v === undefined || v === null) return whole;
    if (typeof v === 'object' && typeof v.key === 'string') {
      const inner = bundle[v.key];
      return inner === undefined ? whole : fill(inner, v.params ?? {}, bundle);
    }
    return String(v);
  });
}

function bundleOf(locale) {
  const out = {};
  for (const r of MODEL.rows) {
    out[r.key] = locale === 'en' ? r.en : (r.is || r.en);
    if (r.variant) out[r.variant.key] = locale === 'en' ? r.variant.en : (r.variant.is || r.variant.en);
  }
  return out;
}

function matches(r) {
  if (state.group && r.group !== state.group) return false;
  if (state.used && r.uses === 0) return false;
  if (state.untranslated && !(r.translatable && r.is === r.en)) return false;
  if (state.q) {
    const hay = (r.key + ' ' + r.en + ' ' + r.is).toLowerCase();
    if (!hay.includes(state.q.toLowerCase())) return false;
  }
  return true;
}

function rowHtml(r) {
  const hot = r.uses >= 100;
  const uses = r.uses > 0
    ? '<span class="uses' + (hot ? ' hot' : '') + '">' + r.uses.toLocaleString() + ' problems</span>'
    : '<span class="tag">one screen</span>';
  const lock = r.lockedEn
    ? '<span class="tag" title="Generated from tools/math_phrasing_catalog.mjs and round-tripped against every problem that uses it.">English is catalog template</span>'
    : '';
  const plural = r.pluralOn
    ? '<span class="tag" title="Icelandic takes the singular at 1, 21, 31 — anything ending in 1 except 11.">inflects on {' + esc(r.pluralOn) + '}</span>'
    : '';
  const variant = r.variant ? field(r.variant.key, 'is', r.variant.is, false, 'Icelandic — singular form (.one)') : '';
  const variantEn = r.variant ? '<div class="field"><label>English — singular form (.one)</label><textarea disabled>' + esc(r.variant.en) + '</textarea></div>' : '';
  return '<article class="row' + (r.translatable ? '' : ' dim') + '" data-key="' + esc(r.key) + '">' +
    '<div class="rowhead">' + uses + '<span class="key">' + esc(r.key) + '</span>' + lock + plural + '</div>' +
    '<div class="pair">' +
      field(r.key, 'en', r.en, r.lockedEn, 'English') +
      field(r.key, 'is', r.is, false, 'Icelandic') +
    '</div>' +
    (r.variant ? '<div class="pair">' + variantEn + variant + '</div>' : '') +
    '<div class="preview" data-preview>' +
      '<div class="line"><span class="loc">en</span><span class="txt" data-pv="en"></span></div>' +
      '<div class="line"><span class="loc">is</span><span class="txt" data-pv="is"></span></div>' +
    '</div>' +
    '<p class="msg" data-msg></p>' +
  '</article>';
}

function field(key, locale, value, locked, label) {
  return '<div class="field"><label>' + esc(label) + '</label>' +
    '<textarea data-field="' + locale + '" data-key="' + esc(key) + '"' + (locked ? ' disabled' : '') +
    ' rows="' + Math.min(4, Math.ceil((value || '').length / 52) || 1) + '">' + esc(value) + '</textarea></div>';
}

function render() {
  const list = MODEL.rows.filter(matches);
  $('#rows').innerHTML = list.length
    ? list.map(rowHtml).join('')
    : '<p class="empty">Nothing matches that filter.</p>';
  for (const el of document.querySelectorAll('.row')) refreshPreview(el);
}

function rowFor(key) { return MODEL.rows.find(r => r.key === key); }

function refreshPreview(el) {
  const r = rowFor(el.dataset.key);
  if (!r) return;
  const en = el.querySelector('textarea[data-field=en][data-key="' + CSS.escape(r.key) + '"]');
  const is = el.querySelector('textarea[data-field=is][data-key="' + CSS.escape(r.key) + '"]');
  const enText = en ? en.value : r.en;
  const isText = is ? is.value : r.is;
  const enB = bundleOf('en'), isB = bundleOf('is');
  enB[r.key] = enText; isB[r.key] = isText;
  el.querySelector('[data-pv=en]').textContent = fill(enText, r.sample, enB);
  el.querySelector('[data-pv=is]').textContent = fill(isText, r.sample, isB);

  const msg = el.querySelector('[data-msg]');
  const problems = [];
  if (!sameHolders(enText, isText)) {
    problems.push('Placeholders differ: English has {' + holders(enText).join('} {') +
      '}, Icelandic has {' + holders(isText).join('} {') + '}. A locale must match all placeholders.');
  }
  const bad = tofu(isText);
  if (bad.length) {
    problems.push('Not in Latin-1: ' + bad.map(c => c + ' (U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') + ')').join(', ') +
      ' — Godot\'s font only supports Latin-1.');
  }
  if (is) is.classList.toggle('err', problems.length > 0);
  if (problems.length) { msg.className = 'msg warn show'; msg.textContent = problems.join('\n'); }
  else if (!msg.dataset.sticky) { msg.className = 'msg'; msg.textContent = ''; }
}

let saveTimer = null;
async function save(key, locale, value, el) {
  setStatus('saving…', true);
  const res = await fetch('/api/key', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key, locale, value }),
  });
  const body = await res.json().catch(() => ({ ok: false, error: 'bad response' }));
  const msg = el.closest('.row').querySelector('[data-msg]');
  if (body.ok) {
    const r = rowFor(key) || MODEL.rows.find(x => x.variant && x.variant.key === key);
    if (r) { if (r.key === key) r[locale] = value; else r.variant[locale] = value; }
    msg.className = 'msg good show'; msg.textContent = 'Saved to disk & i18n guard passed.';
    msg.dataset.sticky = '1';
    setTimeout(() => { delete msg.dataset.sticky; msg.className = 'msg'; msg.textContent = ''; }, 2600);
    setStatus('saved to disk', true);
    updateGitStatus(body.git, body.diff);
  } else {
    msg.className = 'msg bad show';
    msg.dataset.sticky = '1';
    msg.textContent = (body.reverted ? 'Rejected and rolled back — disk file unchanged.\n\n' : 'Not saved.\n\n') + (body.error || '');
    setStatus('guard refused edit', false);
  }
}

function setStatus(text, ok) {
  $('#status').textContent = text;
  $('#dot').className = 'dot' + (ok ? '' : ' bad');
}

function updateGitStatus(git, diff) {
  if (git) {
    $('#git-branch').textContent = '🌿 ' + git.branch + (git.dirty ? ' (uncommitted changes)' : ' (clean)');
    $('#btn-commit').disabled = !git.dirty;
  }
  if (diff) {
    $('#diff').textContent = diff.files
      ? diff.files + ' bundle' + (diff.files === 1 ? '' : 's') + ' modified'
      : 'all changes committed';
  }
}

async function handleCommit() {
  const msg = prompt('Enter a commit message for Git (or leave default):', 'cms: update localization and components');
  if (msg === null) return; // user cancelled
  setStatus('committing to git…', true);
  $('#btn-commit').disabled = true;
  const res = await fetch('/api/git/commit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: msg }),
  });
  const data = await res.json().catch(() => ({ ok: false, output: 'Request failed' }));
  if (data.ok) {
    setStatus('committed to git', true);
    alert('Committed to Git successfully!\n\n' + data.output);
    updateGitStatus(data.git, { files: 0, lines: 0 });
  } else {
    setStatus('git commit failed', false);
    alert('Git commit failed:\n\n' + (data.output || 'Unknown error'));
  }
}

document.addEventListener('input', e => {
  const t = e.target;
  if (!t.matches('textarea[data-field]')) return;
  const row = t.closest('.row');
  refreshPreview(row);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save(t.dataset.key, t.dataset.field, t.value, t), 700);
});

$('#btn-commit').addEventListener('click', handleCommit);
$('#q').addEventListener('input', e => { state.q = e.target.value; render(); });
for (const [id, flag] of [['#f-untranslated', 'untranslated'], ['#f-used', 'used']]) {
  $(id).addEventListener('click', e => {
    state[flag] = !state[flag];
    e.currentTarget.setAttribute('aria-pressed', String(state[flag]));
    render();
  });
}

(async function boot() {
  MODEL = await (await fetch('/api/model')).json();
  const untranslated = MODEL.rows.filter(r => r.translatable && r.is === r.en).length;
  $('#scale').textContent = MODEL.totals.keys + ' phrases · ' +
    MODEL.totals.problemsCovered.toLocaleString() + ' problem renderings' +
    (untranslated ? ' · ' + untranslated + ' untranslated' : ' · fully translated');
  $('#groups').innerHTML = ['<button class="pill" data-g="" aria-pressed="true">All ' + MODEL.totals.keys + '</button>']
    .concat(MODEL.groups.map(g => '<button class="pill" data-g="' + g.id + '" aria-pressed="false" title="' + esc(g.blurb) + '">' + esc(g.label) + ' ' + g.count + '</button>'))
    .join('');
  $('#groups').addEventListener('click', e => {
    const b = e.target.closest('button[data-g]');
    if (!b) return;
    state.group = b.dataset.g || null;
    for (const other of $('#groups').querySelectorAll('button')) other.setAttribute('aria-pressed', String(other === b));
    render();
  });
  updateGitStatus(MODEL.git, MODEL.diff);
  render();
})();
</script>
</body>
</html>`;
