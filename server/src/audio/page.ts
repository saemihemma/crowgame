/**
 * /audio — the sound designer's bench, as one self-contained page.
 *
 * A TS module exporting an HTML string, not a static asset, because the Docker
 * image ships only tsc output. No CDN, no framework.
 *
 * WHAT IT IS FOR. Replacing a sound is one `cp`, and the slow part has never
 * been the copy — it is hearing the thing in context: is the big coin still
 * unmistakable from the coin, is the wrong-answer cue still under the coin, does
 * a run of five coins still climb. So this does not just list files. It plays
 * every sound AT THE VOLUME AND PITCH THE GAME WILL USE, reproducing the two
 * runtime behaviours that audio_manifest.json describes and no audio editor can
 * show you:
 *
 *   the coin run      pitch_ladder walked with playbackRate, five in a row
 *   the reward ladder every tier in order, so an inversion is audible in 8s
 *
 * Web Audio rather than <audio>, for exactly that: a GainNode gives the
 * manifest's `volume` times the master, and playbackRate gives the ladder.
 */
export const AUDIO_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Hörmann Sound</title>
<style>
:root {
  color-scheme: light;
  --page: #f7f6f2; --surface: #fffefb; --raised: #f1efe8;
  --ink: #14130f; --ink-2: #55534b; --muted: #8b887d;
  --ring: rgba(20,19,15,0.10); --line: #e3e0d6;
  --gold: #e0a020; --body: #6a7fb0; --world: #4e9a72; --voice: #c2703a;
  --bad: #c0392b;
}
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --page: #100f0d; --surface: #1a1917; --raised: #232120;
    --ink: #f6f4ee; --ink-2: #c3c0b5; --muted: #8b887d;
    --ring: rgba(255,255,255,0.12); --line: #2e2c29;
    --gold: #f0b943; --body: #8ea4d6; --world: #6cbb92; --voice: #e08e57;
    --bad: #e06a5c;
  }
}
* { box-sizing: border-box; margin: 0; }
body { background: var(--page); color: var(--ink);
  font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; padding: 20px 20px 80px; }
a { color: inherit; }
h1 { font-size: 21px; font-weight: 650; letter-spacing: -0.01em; }
h2 { font-size: 12px; font-weight: 650; color: var(--ink-2); text-transform: uppercase;
  letter-spacing: .07em; margin: 26px 0 8px; display: flex; align-items: center; gap: 10px; }
h2::after { content: ""; flex: 1; height: 1px; background: var(--line); }
.wrap { max-width: 1120px; margin: 0 auto; }

/* gate */
.gate { max-width: 380px; margin: 14vh auto; background: var(--surface);
  border: 1px solid var(--ring); border-radius: 14px; padding: 26px; display: grid; gap: 12px; }
.gate h1 { font-size: 18px; }
.gate p { color: var(--muted); font-size: 13px; }
input[type=password] { border: 1px solid var(--ring); background: var(--page); color: var(--ink);
  border-radius: 9px; padding: 10px 12px; font: inherit; width: 100%; }
.err { color: var(--bad); font-size: 13px; min-height: 1.2em; }

button { font: inherit; color: var(--ink); background: var(--surface);
  border: 1px solid var(--ring); border-radius: 9px; padding: 7px 13px; cursor: pointer; }
button:hover { background: var(--raised); }
button.primary { background: var(--gold); border-color: transparent; color: #14130f; font-weight: 600; }
button.play { width: 38px; height: 38px; padding: 0; border-radius: 50%; font-size: 13px; flex: none; }
button.play.on { background: var(--gold); border-color: transparent; color: #14130f; }

.top { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; margin-bottom: 6px; }
.top .sub { color: var(--muted); font-size: 13px; }
.bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
  background: var(--surface); border: 1px solid var(--ring); border-radius: 12px;
  padding: 12px 14px; margin: 14px 0 4px; position: sticky; top: 10px; z-index: 5; }
.bar label { font-size: 12px; color: var(--ink-2); display: flex; align-items: center; gap: 7px; }
.bar input[type=range] { width: 130px; accent-color: var(--gold); }
.bar input[type=search] { border: 1px solid var(--ring); background: var(--page); color: var(--ink);
  border-radius: 9px; padding: 7px 11px; font: inherit; min-width: 190px; }
.spacer { flex: 1; }

.row { display: flex; gap: 14px; align-items: flex-start; background: var(--surface);
  border: 1px solid var(--ring); border-radius: 12px; padding: 12px 14px; margin-bottom: 8px; }
.row.missing { border-color: var(--bad); }
.row .id { min-width: 210px; flex: none; }
.row .ev { font-weight: 640; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
.row .key { color: var(--muted); font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.row .brief { flex: 1; min-width: 200px; color: var(--ink-2); font-size: 13px; }
.row .fires { color: var(--muted); font-size: 12px; margin-top: 3px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.meta { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
.tag { font-size: 11px; color: var(--ink-2); background: var(--raised);
  border-radius: 20px; padding: 2px 9px; font-variant-numeric: tabular-nums; }
.tag.warn { color: var(--bad); }
canvas.wave { width: 150px; height: 38px; flex: none; opacity: .85; }

.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(132px, 1fr)); gap: 9px; margin: 14px 0 4px; }
.tile { background: var(--surface); border: 1px solid var(--ring); border-radius: 11px; padding: 10px 12px; }
.tile .k { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
.tile .v { font-size: 19px; font-weight: 640; font-variant-numeric: tabular-nums; }
.note { color: var(--muted); font-size: 12.5px; margin: 4px 0 0; }
.fam-BODY .ev { color: var(--body); } .fam-WORLD .ev { color: var(--world); }
.fam-VOICE .ev { color: var(--voice); }
@media (max-width: 720px) {
  .row { flex-wrap: wrap; } canvas.wave { display: none; } .row .id { min-width: 150px; }
  .bar { position: static; }
}
</style>
</head>
<body>
<div class="wrap" id="root"></div>
<script>
const $ = (tag, attrs = {}, kids = []) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const kid of [].concat(kids)) if (kid) el.appendChild(kid);
  return el;
};
const root = document.getElementById('root');

// ── the gate ────────────────────────────────────────────────────────────────
function gate(message) {
  root.innerHTML = '';
  const input = $('input', { type: 'password', placeholder: 'Password', autofocus: 'true' });
  const err = $('div', { class: 'err', text: message || '' });
  const submit = async () => {
    err.textContent = '';
    const res = await fetch('/api/v1/audio/session', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: input.value }),
    });
    if (res.ok) return load();
    err.textContent = res.status === 429 ? 'Too many attempts. Wait a minute.' : 'Wrong password.';
    input.select();
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  root.appendChild($('div', { class: 'gate' }, [
    $('h1', { text: 'Hörmann Sound' }),
    $('p', { text: 'Every sound and song in the game, at the volume it actually plays.' }),
    input, err,
    $('button', { class: 'primary', onclick: submit, text: 'Open' }),
  ]));
  input.focus();
}

// ── playback ────────────────────────────────────────────────────────────────
// One AudioContext, one master gain. Every sound is played through a GainNode
// set to the manifest's own volume times the master, so what you hear is what a
// child hears -- which is the whole reason this page exists rather than a folder
// of files in Finder.
let ctx = null;
const buffers = new Map();
let master = 1.0;
let live = [];

function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

async function buffer(key) {
  if (buffers.has(key)) return buffers.get(key);
  const res = await fetch('/api/v1/audio/file/' + encodeURIComponent(key));
  if (!res.ok) throw new Error('fetch ' + key + ': ' + res.status);
  const decoded = await audio().decodeAudioData(await res.arrayBuffer());
  buffers.set(key, decoded);
  return decoded;
}

function stopAll() {
  for (const node of live) { try { node.stop(); } catch (e) { /* already ended */ } }
  live = [];
  document.querySelectorAll('button.play.on').forEach(b => { b.classList.remove('on'); b.textContent = '▶'; });
}

/** Play one sound. semitones is the runtime pitch ladder; loop is for a bed. */
async function play(sound, { semitones = 0, loop = false, when = 0, gainScale = 1 } = {}) {
  const buf = await buffer(sound.key);
  const c = audio();
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = loop;
  src.playbackRate.value = Math.pow(2, semitones / 12);
  const g = c.createGain();
  const volume = typeof sound.mix.volume === 'number' ? sound.mix.volume : 1;
  g.gain.value = volume * master * gainScale;
  src.connect(g).connect(c.destination);
  src.start(c.currentTime + when);
  live.push(src);
  return src;
}

// ── waveform ────────────────────────────────────────────────────────────────
// Peak-per-column, drawn once per sound. It is not analysis; it is a shape you
// can recognise a file by at a glance, which is what makes a list of forty
// scannable at all.
async function drawWave(canvas, sound) {
  let buf;
  try { buf = await buffer(sound.key); } catch (e) { return; }
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth * dpr, h = canvas.clientHeight * dpr;
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d');
  const data = buf.getChannelData(0);
  const per = Math.max(1, Math.floor(data.length / w));
  g.fillStyle = getComputedStyle(document.body).getPropertyValue('--gold').trim() || '#e0a020';
  for (let x = 0; x < w; x++) {
    let peak = 0;
    for (let i = x * per; i < (x + 1) * per && i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
    const bar = Math.max(1, peak * h);
    g.fillRect(x, (h - bar) / 2, 1, bar);
  }
}

// ── the page ────────────────────────────────────────────────────────────────
const FAMILY_ORDER = ['BODY', 'WORLD', 'VOICE'];
function familyRank(name) {
  const i = FAMILY_ORDER.findIndex(f => name.toUpperCase().startsWith(f));
  return i === -1 ? 9 : i;
}

function render(lib) {
  root.innerHTML = '';
  const seconds = b => b ? b.duration.toFixed(2) + 's' : '';

  root.appendChild($('div', { class: 'top' }, [
    $('h1', { text: 'Hörmann Sound' }),
    $('div', { class: 'sub', text: lib.sounds.length + ' sounds · the mix as shipped' }),
  ]));

  // The mix, up front: these are the numbers every row below is multiplied by.
  const tiles = $('div', { class: 'tiles' });
  for (const [k, v] of Object.entries(lib.mix)) {
    tiles.appendChild($('div', { class: 'tile' }, [
      $('div', { class: 'k', text: k.replace(/_/g, ' ') }),
      $('div', { class: 'v', text: String(v) }),
    ]));
  }
  root.appendChild(tiles);

  // Controls.
  const search = $('input', { type: 'search', placeholder: 'Filter by moment, key or brief…' });
  const vol = $('input', { type: 'range', min: '0', max: '100', value: '100' });
  const volOut = $('span', { text: '100%' });
  vol.addEventListener('input', () => { master = vol.value / 100; volOut.textContent = vol.value + '%'; });

  const bar = $('div', { class: 'bar' }, [
    search,
    $('button', { text: '▲ Reward ladder', title: 'Every tier in order. An inversion is audible in eight seconds.',
      onclick: () => rewardLadder(lib) }),
    $('button', { text: '● Coin run', title: 'Five coins inside the ladder window, exactly as the game pitches them.',
      onclick: () => coinRun(lib) }),
    $('button', { text: '✎ Answer streak', title: 'Four right answers in a row, climbing.',
      onclick: () => streakRun(lib) }),
    $('div', { class: 'spacer' }),
    $('label', {}, [document.createTextNode('Master'), vol, volOut]),
    $('button', { text: '■ Stop', onclick: stopAll }),
  ]);
  root.appendChild(bar);
  root.appendChild($('p', { class: 'note',
    text: 'Volume, pitch runs and looping match godot/data/audio/audio_manifest.json. '
        + 'Replacing a sound is one cp over the same filename — see brand/SOUND_DESIGN.md §8.' }));

  for (const w of lib.warnings) root.appendChild($('p', { class: 'note', text: '⚠ ' + w }));

  // Group by family, in the order the design states them.
  const groups = new Map();
  for (const s of lib.sounds) {
    if (!groups.has(s.family)) groups.set(s.family, []);
    groups.get(s.family).push(s);
  }
  const names = [...groups.keys()].sort((a, b) => familyRank(a) - familyRank(b) || a.localeCompare(b));

  const rows = [];
  for (const name of names) {
    const heading = $('h2', { text: name });
    root.appendChild(heading);
    const section = $('div');
    root.appendChild(section);
    for (const sound of groups.get(name)) {
      const canvas = $('canvas', { class: 'wave' });
      const btn = $('button', { class: 'play', text: '▶', title: 'Play' });
      const loops = sound.kind === 'bed' || sound.kind === 'loop' || sound.kind === 'music';
      btn.addEventListener('click', async () => {
        if (btn.classList.contains('on')) return stopAll();
        stopAll();
        if (loops) { btn.classList.add('on'); btn.textContent = '■'; }
        const src = await play(sound, { loop: loops });
        src.onended = () => { btn.classList.remove('on'); btn.textContent = '▶'; };
      });

      const tags = $('div', { class: 'meta' });
      const tag = (t, cls) => tags.appendChild($('span', { class: 'tag' + (cls ? ' ' + cls : ''), text: t }));
      if (sound.missing) tag('FILE MISSING', 'warn');
      tag('vol ' + (sound.mix.volume ?? 1));
      if (sound.mix.pool !== undefined) tag('pool ' + sound.mix.pool);
      if (sound.mix.min_interval_ms !== undefined) tag('floor ' + sound.mix.min_interval_ms + 'ms');
      if (sound.mix.pitch_jitter !== undefined) tag('jitter ±' + sound.mix.pitch_jitter + ' st');
      if (sound.mix.pitch_ladder) tag('ladder ' + sound.mix.pitch_ladder.join('·'));
      if (sound.mix.max_distance !== undefined) tag('reach ' + sound.mix.max_distance + 'px');
      if (sound.kind !== 'sfx') tag(sound.kind);
      if (sound.bytes !== null) tag((sound.bytes / 1024).toFixed(0) + ' KB');
      const durTag = $('span', { class: 'tag', text: '…' });
      tags.appendChild(durTag);

      const row = $('div', { class: 'row fam-' + familyKey(sound.family) + (sound.missing ? ' missing' : '') }, [
        btn,
        $('div', { class: 'id' }, [
          $('div', { class: 'ev', text: sound.event || sound.key }),
          sound.event ? $('div', { class: 'key', text: sound.key }) : null,
          tags,
        ]),
        $('div', { class: 'brief' }, [
          $('div', { text: sound.brief || '—' }),
          sound.firesFrom ? $('div', { class: 'fires', text: sound.firesFrom }) : null,
        ]),
        canvas,
      ]);
      section.appendChild(row);
      rows.push({ row, sound });
      // Decode lazily so forty fetches do not all land at once on a cold load.
      requestIdleCallback ? requestIdleCallback(() => paint()) : setTimeout(paint, 50);
      async function paint() {
        await drawWave(canvas, sound);
        const b = buffers.get(sound.key);
        durTag.textContent = b ? seconds(b) : 'unreadable';
      }
    }
  }

  const filter = () => {
    const q = search.value.trim().toLowerCase();
    for (const { row, sound } of rows) {
      const hay = [sound.event, sound.key, sound.brief, sound.family].join(' ').toLowerCase();
      row.style.display = !q || hay.includes(q) ? '' : 'none';
    }
  };
  search.addEventListener('input', filter);
}

function familyKey(family) {
  const upper = family.toUpperCase();
  return FAMILY_ORDER.find(f => upper.startsWith(f)) || 'OTHER';
}

// ── the three demonstrations ────────────────────────────────────────────────
// Each reproduces something audio_manifest.json describes that you cannot hear
// by opening a file: the ordering, and the two runtime pitch runs.

const LADDER = ['ui_hover', 'button_focus', 'button', 'coin_collect', 'correct',
                'big_coin', 'milestone', 'big_coin_all', 'comeback', 'level_complete'];

function byKey(lib, key) { return lib.sounds.find(s => s.key === key); }

async function rewardLadder(lib) {
  stopAll();
  let at = 0;
  for (const key of LADDER) {
    const sound = byKey(lib, key);
    if (!sound) continue;
    await play(sound, { when: at });
    const b = buffers.get(key);
    at += Math.max(0.42, (b ? b.duration : 0.4) + 0.18);
  }
}

/** Five coins inside ladder_window_ms, walked up the manifest's own ladder. */
async function coinRun(lib) {
  stopAll();
  const sound = byKey(lib, 'coin_collect');
  if (!sound) return;
  const ladder = sound.mix.pitch_ladder || [0];
  for (let i = 0; i < ladder.length; i++) {
    await play(sound, { semitones: ladder[i], when: i * 0.24 });
  }
}

/** Four right answers in a row: the streak, as game.gd pitches it. */
async function streakRun(lib) {
  stopAll();
  const sound = byKey(lib, 'correct');
  if (!sound) return;
  const ladder = sound.mix.pitch_ladder || [0];
  for (let i = 0; i < Math.min(4, ladder.length); i++) {
    await play(sound, { semitones: ladder[i], when: i * 0.62 });
  }
}

// ── boot ────────────────────────────────────────────────────────────────────
async function load() {
  const res = await fetch('/api/v1/audio/manifest');
  if (res.status === 401) return gate('');
  if (!res.ok) {
    root.innerHTML = '';
    const body = await res.json().catch(() => ({}));
    return root.appendChild($('div', { class: 'gate' }, [
      $('h1', { text: 'Not available' }),
      $('p', { text: body.error || ('HTTP ' + res.status) }),
    ]));
  }
  render(await res.json());
}
load();
</script>
</body>
</html>`;
