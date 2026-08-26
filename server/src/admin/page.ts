/**
 * The owner's dashboard, served at /admin as one self-contained page.
 *
 * A TS module exporting an HTML string, not a static asset, because the Docker
 * image ships only tsc output. No CDN, no framework: the page is fetch + inline
 * SVG. The shell is public; every byte of data sits behind the bearer token the
 * page asks for once and keeps in localStorage, sent only in the Authorization
 * header (never the URL, which would leak it into logs and history).
 *
 * Charts follow the repo-external dataviz method: single-series small
 * multiples (one measure per chart, titles carry identity, no dual axes),
 * thin bars with rounded data-ends, hairline grid, per-bar hover tooltips,
 * light/dark from prefers-color-scheme with a validated palette.
 */
export const ADMIN_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Hörmann Analytics</title>
<style>
:root {
  color-scheme: light;
  --surface: #fcfcfb; --page: #f9f9f7;
  --ink: #0b0b0b; --ink-2: #52514e; --muted: #898781;
  --grid: #e1e0d9; --baseline: #c3c2b7; --ring: rgba(11,11,11,0.10);
  --s1: #2a78d6; --s2: #eb6834; --s3: #1baf7a; --s4: #eda100;
  --good: #0ca30c; --warning: #fab219; --serious: #ec835a; --critical: #d03b3b;
}
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --surface: #1a1a19; --page: #0d0d0d;
    --ink: #ffffff; --ink-2: #c3c2b7; --muted: #898781;
    --grid: #2c2c2a; --baseline: #383835; --ring: rgba(255,255,255,0.10);
    --s1: #3987e5; --s2: #d95926; --s3: #199e70; --s4: #c98500;
  }
}
* { box-sizing: border-box; margin: 0; }
body { background: var(--page); color: var(--ink); font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; padding: 20px; }
h1 { font-size: 20px; font-weight: 650; }
h2 { font-size: 13px; font-weight: 600; color: var(--ink-2); text-transform: uppercase; letter-spacing: .04em; margin: 0 0 8px; }
.top { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.top .when { color: var(--muted); font-size: 12px; }
.top button, .gate button { border: 1px solid var(--ring); background: var(--surface); color: var(--ink); border-radius: 8px; padding: 6px 12px; cursor: pointer; }
.gate { max-width: 460px; margin: 12vh auto; background: var(--surface); border: 1px solid var(--ring); border-radius: 12px; padding: 24px; display: grid; gap: 12px; }
.gate input { border: 1px solid var(--ring); background: var(--page); color: var(--ink); border-radius: 8px; padding: 8px 10px; font: inherit; }
.gate .err { color: var(--critical); font-size: 13px; min-height: 1em; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 18px; }
.tile { background: var(--surface); border: 1px solid var(--ring); border-radius: 12px; padding: 12px 14px; }
.tile .k { font-size: 12px; color: var(--ink-2); }
.tile .v { font-size: 26px; font-weight: 650; margin-top: 2px; }
.tile .sub { font-size: 12px; color: var(--muted); }
.charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; margin-bottom: 20px; }
.chart { background: var(--surface); border: 1px solid var(--ring); border-radius: 12px; padding: 12px 14px; }
.chart svg { display: block; width: 100%; height: 150px; }
.chart .axis { font-size: 10px; fill: var(--muted); font-variant-numeric: tabular-nums; }
.errors { background: var(--surface); border: 1px solid var(--ring); border-radius: 12px; padding: 12px 14px; overflow-x: auto; }
.errors .bar { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; }
.errors select { border: 1px solid var(--ring); background: var(--page); color: var(--ink); border-radius: 8px; padding: 5px 8px; font: inherit; }
table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
th { text-align: left; font-size: 12px; color: var(--ink-2); border-bottom: 1px solid var(--grid); padding: 6px 8px; white-space: nowrap; }
td { border-bottom: 1px solid var(--grid); padding: 7px 8px; vertical-align: top; }
td.msg { max-width: 480px; font-family: ui-monospace, monospace; font-size: 12.5px; word-break: break-word; }
td .src { color: var(--muted); font-size: 11.5px; }
.count { text-align: right; font-weight: 600; }
.status { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; white-space: nowrap; }
.status .dot { width: 8px; height: 8px; border-radius: 50%; }
.st-open .dot { background: var(--critical); } .st-open { color: var(--critical); }
.st-acknowledged .dot { background: var(--warning); }
.st-resolved .dot { background: var(--good); }
.st-ignored .dot { background: var(--muted); }
.actions button { border: 1px solid var(--ring); background: transparent; color: var(--ink-2); border-radius: 6px; padding: 3px 8px; margin-right: 4px; cursor: pointer; font-size: 12px; }
.actions button:hover { color: var(--ink); border-color: var(--baseline); }
.empty { color: var(--muted); padding: 18px 4px; }
#tip { position: fixed; pointer-events: none; background: var(--ink); color: var(--page); border-radius: 6px; padding: 4px 8px; font-size: 12px; display: none; z-index: 10; white-space: nowrap; }
</style>
</head>
<body>
<div id="tip"></div>
<div id="gate" class="gate" hidden>
  <h1>Hörmann Analytics</h1>
  <div>Paste the admin token. It is stored only in this browser and sent only in the Authorization header.</div>
  <input id="token" type="password" placeholder="admin token" autocomplete="off">
  <div class="err" id="gate-err"></div>
  <button id="enter">Open dashboard</button>
</div>
<div id="app" hidden>
  <div class="top">
    <h1>Hörmann Analytics</h1>
    <span class="when" id="when"></span>
    <button id="refresh">Refresh</button>
    <button id="signout">Forget token</button>
  </div>
  <div class="tiles" id="tiles"></div>
  <div class="charts" id="charts"></div>
  <div class="errors" id="ladder"></div>
  <div class="errors">
    <div class="bar">
      <h2 style="margin:0">Errors — deduplicated</h2>
      <select id="err-status">
        <option value="open" selected>open</option>
        <option value="acknowledged">acknowledged</option>
        <option value="resolved">resolved</option>
        <option value="ignored">ignored</option>
        <option value="all">all</option>
      </select>
    </div>
    <div id="err-table"></div>
  </div>
</div>
<script>
'use strict';
const $ = id => document.getElementById(id);
const KEY = 'crow_admin_token';
const fmt = n => n === null || n === undefined ? '—' : Number(n).toLocaleString('en');
const pct = x => x === null || x === undefined ? '—' : (100 * x).toFixed(0) + '%';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function authed(path, opts = {}) {
  return fetch(path, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + localStorage.getItem(KEY) } });
}

function tile(label, value, sub) {
  return '<div class="tile"><div class="k">' + esc(label) + '</div><div class="v">' + value + '</div>'
    + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>';
}

/** One single-series bar chart: thin bars, rounded tops, hairline grid, hover tooltip. */
function barChart(title, rows, color, valueOf, tipOf) {
  const w = 640, h = 150, padL = 34, padB = 18, padT = 8;
  const values = rows.map(valueOf);
  const max = Math.max(1, ...values.map(v => v ?? 0));
  const innerW = w - padL - 6, innerH = h - padT - padB;
  const step = innerW / Math.max(1, rows.length);
  const bw = Math.max(3, Math.min(16, step - 2));
  let bars = '';
  rows.forEach((row, i) => {
    const v = values[i] ?? 0;
    const bh = Math.max(v > 0 ? 3 : 0, innerH * v / max);
    const x = padL + i * step + (step - bw) / 2;
    const y = padT + innerH - bh;
    bars += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1)
      + '" height="' + bh.toFixed(1) + '" rx="' + Math.min(4, bw / 2) + '" fill="' + color
      + '" data-tip="' + esc(tipOf(row)) + '"></rect>';
  });
  const gridY = [0.5, 1].map(f => {
    const y = padT + innerH * (1 - f);
    return '<line x1="' + padL + '" y1="' + y + '" x2="' + (w - 6) + '" y2="' + y + '" stroke="var(--grid)" stroke-width="1"/>'
      + '<text class="axis" x="' + (padL - 5) + '" y="' + (y + 3) + '" text-anchor="end">' + fmt(Math.round(max * f)) + '</text>';
  }).join('');
  const first = rows[0] ? rows[0].day.slice(5) : '';
  const last = rows.length ? rows[rows.length - 1].day.slice(5) : '';
  return '<div class="chart"><h2>' + esc(title) + '</h2>'
    + '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(title) + '">'
    + gridY
    + '<line x1="' + padL + '" y1="' + (padT + innerH) + '" x2="' + (w - 6) + '" y2="' + (padT + innerH) + '" stroke="var(--baseline)" stroke-width="1"/>'
    + bars
    + '<text class="axis" x="' + padL + '" y="' + (h - 4) + '">' + first + '</text>'
    + '<text class="axis" x="' + (w - 6) + '" y="' + (h - 4) + '" text-anchor="end">' + last + '</text>'
    + '</svg></div>';
}

function series(daily, key) {
  const byDay = new Map(daily.map(r => [r.day, r]));
  const out = [];
  const today = new Date();
  for (let i = 27; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10);
    const row = byDay.get(d) || { day: d };
    out.push({ ...row, day: d, value: row[key] ?? 0 });
  }
  return out;
}

async function loadOverview() {
  const res = await authed('/api/v1/admin/overview');
  if (res.status === 401 || res.status === 404) throw new Error('unauthorized');
  const o = await res.json();
  $('when').textContent = 'window: last ' + o.windowDays + ' days · generated ' + new Date(o.generatedAt).toLocaleString();

  const lastDay = o.daily[o.daily.length - 1];
  const sessToday = o.sessions.daily[o.sessions.daily.length - 1];
  const wau = new Set();
  o.daily.slice(-7).forEach(d => { if (d.activeChildren > 0) wau.add(d.day); });
  const wauChildren = o.daily.slice(-7).reduce((m, d) => Math.max(m, d.activeChildren), 0);
  $('tiles').innerHTML =
    tile('Active kids (latest day)', fmt(lastDay ? lastDay.activeChildren : 0), lastDay ? lastDay.day : 'no play yet')
    + tile('Peak daily kids (7d)', fmt(wauChildren), wau.size + ' active day(s) of 7')
    + tile('Sessions (latest day)', fmt(sessToday ? sessToday.sessions : 0),
        sessToday && sessToday.medianMinutes !== null ? 'median ' + sessToday.medianMinutes.toFixed(1) + ' min' : 'gap rule: ' + o.sessions.gapMinutes + ' min')
    + tile('D1 retention', pct(o.retention.d1.cohort ? o.retention.d1.returned / o.retention.d1.cohort : null),
        o.retention.d1.returned + ' of ' + o.retention.d1.cohort + ' kids')
    + tile('D7 retention', pct(o.retention.d7.cohort ? o.retention.d7.returned / o.retention.d7.cohort : null),
        o.retention.d7.returned + ' of ' + o.retention.d7.cohort + ' kids')
    + tile('Answers (all time)', fmt(o.totals.attempts), fmt(o.totals.children) + ' kids · ' + fmt(o.totals.families) + ' families')
    + tile('First-try accuracy (latest day)', pct(lastDay ? lastDay.firstTryAccuracy : null), 'sweet spot 70–85%')
    + tile('Open error groups', fmt(o.totals.openErrorGroups), 'deduplicated bugs');

  const css = getComputedStyle(document.documentElement);
  const c = v => css.getPropertyValue(v).trim();
  $('charts').innerHTML =
    barChart('Active kids per day', series(o.daily, 'activeChildren'), c('--s1'),
      r => r.value, r => r.day + ': ' + fmt(r.value) + ' kids')
    + barChart('Answers per day', series(o.daily, 'attempts'), c('--s2'),
      r => r.value, r => r.day + ': ' + fmt(r.value) + ' answers')
    + barChart('Sessions per day', series(o.sessions.daily, 'sessions'), c('--s3'),
      r => r.value, r => r.day + ': ' + fmt(r.value) + ' sessions'
        + (r.medianMinutes !== null && r.medianMinutes !== undefined ? ' · median ' + Number(r.medianMinutes).toFixed(1) + ' min' : ''))
    + barChart('Error events per day', series(o.errorsDaily, 'events'), c('--s4'),
      r => r.value, r => r.day + ': ' + fmt(r.value) + ' events');
}

/**
 * What the last week says to change, or why it says nothing yet.
 *
 * The overview tile above reports first-try accuracy against the band. This is
 * the next sentence: one knob, one file, from what to what, and the measurement
 * behind it. "Not enough play yet" is rendered as plainly as a recommendation,
 * because it is the honest answer until a real week has been played and hiding
 * it would invite tuning from noise.
 */
async function loadLadder() {
  const res = await authed('/api/v1/admin/ladder-tuning');
  if (!res.ok) throw new Error('unauthorized');
  const d = await res.json();
  const lanes = d.lanes.length === 0 ? '<div class="empty">No lanes served yet.</div>'
    : '<table><thead><tr><th>Lane</th><th style="text-align:right">Answers</th>'
      + '<th style="text-align:right">First-try</th></tr></thead><tbody>'
      + d.lanes.map(l => '<tr><td>' + esc(l.lane) + '</td><td class="count">' + fmt(l.attempts)
        + '</td><td class="count">' + pct(l.firstTryAccuracy) + '</td></tr>').join('')
      + '</tbody></table>';

  let verdict;
  if (!d.sufficient) {
    verdict = '<div class="empty">Not enough play to tune on: ' + esc(d.blockedBy) + '</div>';
  } else if (!d.recommendation) {
    verdict = '<div class="empty">In band at ' + pct(d.firstTryAccuracy)
      + '. Change nothing this week.</div>';
  } else {
    const r = d.recommendation;
    verdict = '<div><strong>Change one thing:</strong> ' + esc(r.knob)
      + ' in <code>' + esc(r.file) + '</code>'
      + (r.parityLocked ? ' <em>(Tier-1 constant: parity fixtures must be regenerated)</em>' : '')
      + '<div class="src">' + esc(r.from) + ' &rarr; ' + esc(r.to) + '</div>'
      + '<div class="src">' + esc(r.why) + '</div></div>';
  }

  $('ladder').innerHTML =
    '<div class="bar"><h2 style="margin:0">Ladder tuning &mdash; last ' + fmt(d.windowDays) + ' days</h2>'
    + '<span class="when">band ' + pct(d.band.low) + '&ndash;' + pct(d.band.high)
    + ' &middot; ' + fmt(d.attempts) + ' answers &middot; ' + fmt(d.children) + ' kid(s) &middot; '
    + fmt(d.daysWithPlay) + ' day(s) with play</span></div>'
    + verdict + lanes;
}

async function loadErrors() {
  const status = $('err-status').value;
  const res = await authed('/api/v1/admin/errors?status=' + status + '&limit=200');
  if (!res.ok) throw new Error('unauthorized');
  const data = await res.json();
  if (data.groups.length === 0) {
    $('err-table').innerHTML = '<div class="empty">Nothing here. ' + (status === 'open' ? 'No open bugs.' : '') + '</div>';
    return;
  }
  const rows = data.groups.map(g =>
    '<tr>'
    + '<td><span class="status st-' + esc(g.status) + '"><span class="dot"></span>' + esc(g.status) + '</span></td>'
    + '<td class="count">' + fmt(g.eventCount) + '</td>'
    + '<td class="msg">' + esc(g.message) + (g.source ? '<div class="src">' + esc(g.source) + '</div>' : '') + '</td>'
    + '<td>' + esc(g.kind || '') + '</td>'
    + '<td>' + esc(g.release || '') + '</td>'
    + '<td>' + new Date(g.lastSeenAt).toLocaleString() + '</td>'
    + '<td class="actions">'
      + ['acknowledged', 'resolved', 'ignored'].filter(s => s !== g.status)
          .map(s => '<button data-fp="' + esc(g.fingerprint) + '" data-to="' + s + '">' + s.slice(0, 7) + '</button>').join('')
    + '</td></tr>').join('');
  $('err-table').innerHTML = '<table><thead><tr><th>Status</th><th style="text-align:right">Events</th><th>Message</th><th>Kind</th><th>Release</th><th>Last seen</th><th>Triage</th></tr></thead><tbody>'
    + rows + '</tbody></table>';
  $('err-table').querySelectorAll('button[data-fp]').forEach(btn => btn.addEventListener('click', async () => {
    await authed('/api/v1/admin/errors/' + encodeURIComponent(btn.dataset.fp) + '/status', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: btn.dataset.to }),
    });
    loadErrors();
  }));
}

async function boot() {
  if (!localStorage.getItem(KEY)) { $('gate').hidden = false; return; }
  try {
    await loadOverview();
    await loadLadder();
    await loadErrors();
    $('app').hidden = false; $('gate').hidden = true;
  } catch {
    localStorage.removeItem(KEY);
    $('gate').hidden = false; $('app').hidden = true;
    $('gate-err').textContent = 'That token was not accepted.';
  }
}

$('enter').addEventListener('click', () => {
  localStorage.setItem(KEY, $('token').value.trim());
  $('token').value = '';
  boot();
});
$('token').addEventListener('keydown', e => { if (e.key === 'Enter') $('enter').click(); });
$('refresh').addEventListener('click', boot);
$('signout').addEventListener('click', () => { localStorage.removeItem(KEY); location.reload(); });
$('err-status').addEventListener('change', loadErrors);

document.addEventListener('mousemove', e => {
  const target = e.target.closest ? e.target.closest('[data-tip]') : null;
  const tip = $('tip');
  if (target) {
    tip.textContent = target.getAttribute('data-tip');
    tip.style.display = 'block';
    tip.style.left = Math.min(window.innerWidth - 180, e.clientX + 12) + 'px';
    tip.style.top = (e.clientY - 30) + 'px';
  } else {
    tip.style.display = 'none';
  }
});

boot();
</script>
</body>
</html>
`;
