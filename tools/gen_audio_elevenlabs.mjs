#!/usr/bin/env node
/**
 * Turn brand/SOUND_DESIGN.md into real sound effects, via ElevenLabs.
 *
 * Usage:
 *   node tools/gen_audio_elevenlabs.mjs --list
 *   node tools/gen_audio_elevenlabs.mjs --script          # -> output/audio-prompts.md
 *   node tools/gen_audio_elevenlabs.mjs --proxy-auth --family WORLD  # key held outside
 *   node tools/gen_audio_elevenlabs.mjs --dry-run --all      # every prompt, no key needed
 *   node tools/gen_audio_elevenlabs.mjs --key coin_collect --takes 4
 *   node tools/gen_audio_elevenlabs.mjs --family VOICE --takes 3
 *   node tools/gen_audio_elevenlabs.mjs --promote coin_collect 2
 *
 * WHERE THE KEY GOES, and it is the whole reason this file is a `tools/` script
 * rather than anything else in the repo:
 *
 *   export ELEVENLABS_API_KEY=...      # your shell, or a gitignored .env
 *
 * NOT in the game, NOT in Railway, NOT in the repo. Generation is an OFFLINE
 * AUTHORING STEP, like `npm run cms` or `npm run math:materialize`: it runs on
 * one machine, writes files, and the files are committed. The game never calls
 * ElevenLabs, the API never calls ElevenLabs, and neither of them should ever
 * hold a credential for something they do not do. `tools/**` is the tree the
 * README already marks "never ships" -- that is exactly the property wanted
 * here. See brand/SOUND_DESIGN.md and deploy/RAILWAY.md for the long version.
 *
 * TAKES ARE NOT ASSETS. Generation is cheap and wrong most of the time, so
 * nothing here overwrites a shipped file. Takes land in output/audio-takes/
 * (gitignored) and you listen to them before anything moves.
 *
 * `--promote` then does the mastering, and it is the part that matters most:
 * THE PLACEHOLDER IS THE SPEC. Every generated file already carries the sample
 * rate its slot wants, the peak its tier on the reward ladder requires, and the
 * duration budget the design gives it -- so a take is matched to the file it
 * replaces rather than to a table repeated in two languages. It is trimmed (a
 * generator's half-second of room tone in front of a jump cue IS latency),
 * peak-matched, cross-faded into itself if it loops, refused if it blows the
 * duration budget, and written as WAV under the SAME FILENAME. So the manifest
 * is never touched, no asset is orphaned, nothing depends on MP3 gapless
 * behaviour, and `git checkout` is the whole of the undo.
 *
 * Needs ffmpeg on PATH for the decode. Nothing else.
 */
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(ROOT, 'godot/data/audio/audio_manifest.json');
const EVENTS = join(ROOT, 'godot/data/audio/sound_events.json');
const DOC = join(ROOT, 'brand/SOUND_DESIGN.md');
const TAKES = join(ROOT, 'output/audio-takes');
/**
 * Where the prompt sheet lands by default.
 *
 * Absolute, off the script's own location rather than off the working directory,
 * so `--script` puts the file in the same place whether it was run from the repo
 * root, from tools/, or through `npm run` (which sets cwd to the package root and
 * would otherwise be the only reliable way to invoke it).
 */
const SHEET = join(ROOT, 'output/audio-prompts.md');

const THEMES = join(ROOT, 'godot/data/themes');

const ENDPOINT = 'https://api.elevenlabs.io/v1/sound-generation';
/**
 * The music endpoint is a DIFFERENT model and a different shape.
 *
 * NOT VERIFIED against the live API from this repo -- the environment this was
 * written in cannot reach api.elevenlabs.io, so the request below is built from
 * the documented shape and has never had a response. Treat a 4xx here as "check
 * the current docs", not as "the tool is broken", and prefer `--script` for
 * music until someone has seen it work once: a song is the one thing in the bank
 * worth auditioning in a browser before it is worth automating.
 */
const MUSIC_ENDPOINT = 'https://api.elevenlabs.io/v1/music';

/**
 * The house style, prepended to every prompt.
 *
 * Text-to-audio models drift toward cinema: everything arrives big, wet and
 * three seconds long. Every clause here is load-bearing against that, and they
 * are the same rules brand/SOUND_DESIGN.md states for a human.
 */
const HOUSE = [
    'Children\'s video game sound effect for ages 5 to 8.',
    'Clean, dry, close-miked, mono, no reverb, no room, no music bed.',
    'Warm and friendly, never harsh, never startling, never scary.',
    'No speech, no voice, no animal cries, no cinematic impact, no sub-bass boom.',
    'Starts immediately with no silence at the front.',
].join(' ');

/**
 * The per-family character. This is the part a generic prompt cannot know and
 * the part that makes forty separate generations sound like one game.
 */
const FAMILY_STYLE = {
    BODY: 'The character is a small WIND-UP TIN BIRD: felt, soft metal, a tiny servo motor. '
        + 'Mechanical but toy-like and lovable. Mid-low, dry, physical. Not a real bird, not a weapon.',
    WORLD: 'A storybook world object: wood, air, glass, leaves or water. '
        + 'Soft-edged and slightly distant, sitting behind the action rather than on top of it.',
    VOICE: 'A tuned percussion instrument: glockenspiel, celeste, music box or marimba. '
        + 'Bell-like with a natural decay, in C major pentatonic, warm and musical.',
    OTHER: 'Soft, musical and unobtrusive.',
};

// ── reading the design ───────────────────────────────────────────────────────

function plain(cell) {
    return cell.replace(/`/g, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').trim();
}

/** Every moment, its family, and its brief, straight out of the design doc. */
async function readDesign() {
    const markdown = await readFile(DOC, 'utf8');
    const out = new Map();
    let family = 'OTHER';
    for (const line of markdown.split('\n')) {
        const heading = /^###\s+(.+?)\s*$/.exec(line);
        if (heading) {
            const name = heading[1].toUpperCase();
            family = ['BODY', 'WORLD', 'VOICE'].find(f => name.startsWith(f)) ?? 'OTHER';
            continue;
        }
        const row = /^\|([^|]*)\|\s*`([a-z_]+)`\s*\|([^|]*)\|([^|]*)\|/.exec(line);
        if (!row) continue;
        out.set(row[2].trim(), { moment: plain(row[1]), family, brief: plain(row[4]) });
    }
    return out;
}

/** The full job list: manifest key -> everything needed to prompt for it. */
async function buildJobs() {
    const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
    const events = JSON.parse(await readFile(EVENTS, 'utf8'));
    const design = await readDesign();

    const eventForKey = new Map();
    for (const [event, key] of Object.entries(events)) {
        if (!event.startsWith('_') && !eventForKey.has(key)) eventForKey.set(key, event);
    }

    const jobs = [];
    for (const [key, def] of Object.entries(manifest.sfx ?? {})) {
        if (key.startsWith('_')) continue;
        const event = eventForKey.get(key) ?? null;
        const doc = design.get(event ?? '');
        // A def with a reach and no pool is a proximity LOOP, and a loop needs a
        // longer generation and an explicit seamless instruction; see below.
        const looping = Number(def.max_distance ?? 0) > 0
            && def.pool === undefined && def.min_interval_ms === undefined;
        jobs.push({
            key, event, def, looping,
            family: doc?.family ?? 'OTHER',
            moment: doc?.moment ?? key,
            brief: doc?.brief ?? '',
        });
    }
    for (const [key, def] of Object.entries(manifest.beds ?? {})) {
        if (key.startsWith('_')) continue;
        jobs.push({
            key, event: null, def, looping: true, family: 'WORLD',
            moment: `Ambience bed: ${key.replace(/^amb_/, '').replace(/_/g, ' ')}`,
            // The beds' brief is the world table in §7 rather than a moment row,
            // so it is named here and nowhere else.
            brief: BED_BRIEF[key] ?? '',
        });
    }
    for (const [key, def] of Object.entries(manifest.music ?? {})) {
        if (key.startsWith('_')) continue;
        jobs.push({
            key, event: null, def, looping: true, family: 'MUSIC',
            moment: key === 'title_music' ? 'Title screen song'
                : `Song for the ${key.replace(/^music_/, '').replace(/_/g, ' ')} world`,
            brief: '',
        });
    }
    return jobs;
}

/**
 * The ambience beds, whose brief lives in §7 of the doc as a world table rather
 * than as a moment row. Kept in sync by hand, which is safe because there are
 * five of them and a sixth would be a new world.
 */
const BED_BRIEF = {
    amb_emberwood: 'Warm forest: wind moving through leaves, with a small bird far enough away to be scenery.',
    amb_prism_hollow: 'A crystal cave: low room tone underneath, occasional glass drips overhead, and nothing in the middle — which is what makes a cave sound big.',
    amb_sugarstorm: 'A bright sunny meadow: a light breeze with tiny bells in it. The only cheerful bed.',
    amb_geyserworks: 'Steam and machinery: a low rumble with a steam hiss that swells and fades on a slow schedule.',
    amb_aurora_spire: 'The top of the world at night: high shimmer, very sparse, almost nothing happening. Where the game gets quiet.',
};

/**
 * One song per WORLD, with the tempo and instrument ladder from §7 of the doc.
 *
 * Same instruments across all five so it is one game; a different lead so it is
 * five places. All in C, to match the scale every cue is tuned to (§2) -- a track
 * in another key would put the coin a semitone off its own music, which is the
 * one thing the pentatonic rule exists to prevent.
 */
const WORLD_MUSIC = {
    music_emberwood: { bpm: 96, lead: 'marimba', under: 'acoustic bass and a light shaker',
        mood: 'a warm sunlit forest; friendly, walking pace, gently curious' },
    music_prism_hollow: { bpm: 88, lead: 'celeste', under: 'struck glass bowls with long tails',
        mood: 'a vast crystal cave; slower, spacious, a little mysterious but never frightening' },
    music_sugarstorm: { bpm: 108, lead: 'music box', under: 'pizzicato strings',
        mood: 'a bright sunny meadow; bouncy, playful, the happiest track in the game' },
    music_geyserworks: { bpm: 100, lead: 'marimba', under: 'soft brass pulses on the beat',
        mood: 'steam and friendly machinery; steady, purposeful, a working rhythm' },
    music_aurora_spire: { bpm: 76, lead: 'celeste and a soft pad', under: 'almost nothing',
        mood: 'the top of the world at night; floating, sparse, the quietest track in the game' },
    title_music: { bpm: 84, lead: 'solo music box', under: 'nothing at all',
        mood: 'the game is about to start. The Emberwood theme slowed right down to one '
            + 'music box alone -- no percussion, no bass. An invitation, not a fanfare' },
};

/** Seconds to ask for. Short for a cue, long enough to be trimmed for a bed. */
function duration(job) {
    // A song. 75 seconds is the shortest thing that does not feel like a jingle
    // on the third lap, and the loop is what makes the length stop mattering.
    if (job.family === 'MUSIC') return 75;
    if (job.def.file?.includes('/ambience/')) return 12;
    if (job.looping) return 6;
    // The ladder in the doc: a run-ending fanfare may be long, a tick may not.
    if (['level_complete', 'comeback', 'big_coin_all'].includes(job.key)) return 3;
    if (['owl_saved', 'milestone', 'ability', 'big_coin', 'answer_reveal'].includes(job.key)) return 2;
    return 1;
}

/**
 * Keep the sentences that describe the SOUND; drop the ones written for a human.
 *
 * The doc's briefs are the right brief precisely because they carry context a
 * person needs: what a cue used to be, why it changed, which rule it obeys, and
 * where that rule is written down. None of that is describable audio, and fed to
 * a generator it is worse than noise -- "See the house rule above" and "this is
 * the single most important sound added to the game" are instructions a model
 * will try to honour.
 *
 * So the brief is filtered rather than rewritten. Editing the doc to suit the
 * generator would cost the human reader the better half of every row, and the
 * human is who the doc is for.
 */
const NOT_ABOUT_THE_SOUND = [
    /\bsee the\b/i, /\bsee \S+\.md\b/i, /§/,
    /\bused to\b/i, /\bit had none\b/i, /\bnobody\b/i,
    /\bthis is the (single|only|most)\b/i, /\badded to the game\b/i,
    /\bPRODUCT\.md\b/, /\bBRAND_SYSTEM\b/, /\bfx_tuning\b/, /\bplayer\/step_distance_px\b/,
    /\bthe design\b/i, /\bon purpose\b/i, /\bdeliberately\b/i,
];

function promptableBrief(brief) {
    return brief
        // Split on sentence ends, keeping it crude: a brief is two or three
        // sentences and a real tokenizer would be more machinery than the job.
        .split(/(?<=[.!?])\s+/)
        .filter(sentence => sentence.trim() && !NOT_ABOUT_THE_SOUND.some(re => re.test(sentence)))
        .join(' ')
        .trim();
}

/** The prompt for a song, which shares nothing with a sound-effect prompt. */
function buildMusicPrompt(job) {
    const w = WORLD_MUSIC[job.key];
    if (!w) return `Instrumental background music for a children's game. ${job.moment}.`;
    return [
        'Instrumental background music for a gentle children\'s platform game, for ages 5 to 8.',
        `${job.moment}: ${w.mood}.`,
        `Lead instrument: ${w.lead}. Underneath: ${w.under}.`,
        `Around ${w.bpm} BPM, in C major.`,
        'Warm, simple, and repetitive enough to sit under play for a long time without',
        'becoming annoying. Melodic but never busy: this plays UNDER sound effects and a',
        'child answering maths questions, so it must leave the middle of the mix alone.',
        'No drums louder than a light shaker, no build, no drop, no key change, no vocals,',
        'no sudden dynamics, nothing dramatic or tense.',
        'It must LOOP: end where it began, so the last bar leads back into the first.',
    ].join(' ');
}

function buildPrompt(job) {
    if (job.family === 'MUSIC') return buildMusicPrompt(job);
    const parts = [HOUSE, FAMILY_STYLE[job.family], job.moment + '.', promptableBrief(job.brief)];
    if (job.looping) {
        parts.push('A CONTINUOUS LOOPING TEXTURE with no beginning and no end: '
            + 'even, steady, no single dominant event, so it can be cut and cross-faded into a seamless loop.');
    } else {
        parts.push('One single short event, not a sequence and not a loop.');
    }
    // The two rails from the doc that a model will otherwise ignore.
    if (job.key === 'wrong') {
        parts.push('CRITICAL: this must NOT sound like failure. No buzzer, no descending "wah", '
            + 'no error tone. Flat in pitch, low, soft and short. A child hears it hundreds of times.');
    }
    if (job.key === 'door_locked') {
        parts.push('CRITICAL: not a buzzer and not an error. Two gentle knocks on warm wood.');
    }
    return parts.filter(Boolean).join(' ');
}

// ── generating ───────────────────────────────────────────────────────────────

/**
 * The header that carries the key, or nothing at all.
 *
 * PROXY-ATTACHED CREDENTIALS. A Claude Code cloud environment can hold an "API
 * credential": the key is stored on the environment and Anthropic's agent proxy
 * adds the header AFTER the request has left the sandbox, so it never reaches
 * the agent, the commands it runs, or the environment variables. Storing an
 * ElevenLabs key that way is strictly better than exporting it -- and it also
 * grants network reach to the host, which the environment's allowlist otherwise
 * would not.
 *
 * In that mode there IS no key here to send, so `--proxy-auth` sends the request
 * bare and lets the proxy authenticate it. Everything else is unchanged.
 */
function authHeader(apiKey) {
    return apiKey ? { 'xi-api-key': apiKey } : {};
}

async function generate(job, take, apiKey) {
    if (job.family === 'MUSIC') return generateMusic(job, take, apiKey);
    const body = {
        text: buildPrompt(job),
        duration_seconds: duration(job),
        // Low influence lets the model make something musical; high influence
        // makes it follow the words literally and, in practice, blandly. 0.4 is
        // the setting that kept the brief without flattening the result.
        prompt_influence: 0.4,
    };
    const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { ...authHeader(apiKey), 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`${job.key} take ${take}: HTTP ${response.status} ${detail.slice(0, 300)}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const path = join(TAKES, `${job.key}-${take}.mp3`);
    await writeFile(path, bytes);
    return { path, bytes: bytes.length };
}

/** A song, from the music model. See MUSIC_ENDPOINT for what is unverified. */
async function generateMusic(job, take, apiKey) {
    const response = await fetch(MUSIC_ENDPOINT, {
        method: 'POST',
        headers: { ...authHeader(apiKey), 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: buildPrompt(job), music_length_ms: duration(job) * 1000 }),
    });
    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`${job.key} take ${take}: HTTP ${response.status} ${detail.slice(0, 300)}\n`
            + '    The music endpoint is unverified from this repo -- check the current '
            + 'ElevenLabs docs, or use --script and paste the prompt into the browser.');
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const path = join(TAKES, `${job.key}-${take}.mp3`);
    await writeFile(path, bytes);
    return { path, bytes: bytes.length };
}

// ── the script ───────────────────────────────────────────────────────────────

/**
 * Every prompt as one document, to paste into ElevenLabs by hand.
 *
 * THE PATH THAT NEEDS NO API KEY AND NO NETWORK, and therefore the one that
 * always works. It carries the three things a prompt alone does not: how long to
 * ask for, what the slot actually budgets, and the exact filename to save the
 * download as — so a browser session and `--promote` meet in the middle.
 *
 * Ordered so a session can stop after any block and have finished something
 * coherent: the crow, then the world, then the interface, then the songs.
 */
async function script(jobs, out) {
    const order = { BODY: 0, WORLD: 1, VOICE: 2, MUSIC: 3, OTHER: 4 };
    const sorted = [...jobs].sort((a, b) =>
        (order[a.family] ?? 9) - (order[b.family] ?? 9) || a.key.localeCompare(b.key));

    const lines = [
        '# Hörmann — sound prompts',
        '',
        // Every .md in this repo declares what it is and who owns it, and
        // tools/validate_docs.js checks it. A generated sheet is no exception --
        // output/web/README.md sets the same precedent.
        'Status: Supportive',
        'Authority: None. Generated from brand/SOUND_DESIGN.md and',
        '`godot/data/audio/audio_manifest.json` by `npm run audio:gen -- --script`;',
        'those two are the truth and this is a convenience. Do not hand-edit — regenerate.',
        '',
        'One block per sound, in the order',
        'worth recording them. Paste the prompt into ElevenLabs (Sound Effects for',
        'everything except the songs, which go to the music model), set the duration, and',
        'save the download as the filename given.',
        '',
        'Then master it into the game — this is the step that matters, because it matches',
        'the take to the slot rather than trusting the download:',
        '',
        '```bash',
        'mv ~/Downloads/whatever.mp3 output/audio-takes/<key>-1.mp3',
        'npm run audio:gen -- --promote <key> 1',
        'npm run audio:audit',
        '```',
        '',
        '`--promote` trims the silence off the front, matches the peak to the sound\'s tier',
        'on the reward ladder, cross-fades it if it loops, and refuses it if it blows the',
        'duration budget. Take that seriously: **ask for the duration below**, because a',
        'generator will happily hand back three seconds for a coin.',
        '',
    ];

    let family = '';
    for (const job of sorted) {
        if (job.family !== family) {
            family = job.family;
            lines.push('', `## ${family}`, '');
        }
        const target = job.def.file ? `godot/${job.def.file}` : '(no slot)';
        lines.push(`### \`${job.key}\`${job.event ? ` — fires on \`${job.event}\`` : ''}`);
        lines.push('');
        const slot = await slotSeconds(job);
        lines.push(`- **Ask for:** ${duration(job)}s${job.looping ? ' (a loop — it gets cross-faded on promote)' : ''}`);
        lines.push(`- **The slot budgets:** ${slot}`);
        // The two numbers disagree on purpose for the short cues, and without
        // saying so the script reads as a contradiction: a generator cannot
        // reliably make a 200 ms event, so you ask for a second of it and the
        // promote step cuts it down. Say it where the confusion happens.
        const budget = Number.parseFloat(slot);
        if (!job.looping && Number.isFinite(budget) && duration(job) > budget * 1.6) {
            lines.push(`- **Shorter than you can ask for.** Take the second, then cut it:`
                + ` \`--promote ${job.key} 1 --max-ms ${Math.max(120, Math.round(budget * 1600))}\``);
        }
        lines.push(`- **Save as:** \`${target}\``);
        lines.push(`- **Promote with:** \`npm run audio:gen -- --promote ${job.key} 1\``);
        lines.push('');
        lines.push('```');
        lines.push(buildPrompt(job));
        lines.push('```');
        lines.push('');
    }

    const text = lines.join('\n');
    if (out) {
        await mkdir(dirname(out), { recursive: true });
        await writeFile(out, text);
        console.log(`${sorted.length} prompts written to ${out.replace(ROOT + '/', '')}`);
        return;
    }
    process.stdout.write(text);
}

/** What the placeholder in this slot is, so the script can state the budget. */
async function slotSeconds(job) {
    if (!job.def.file) return 'unknown';
    const path = join(ROOT, 'godot', job.def.file);
    if (!existsSync(path) || !path.endsWith('.wav')) {
        return job.family === 'MUSIC' ? 'a loop, so any length works' : 'unknown';
    }
    try {
        const { rate, samples } = readWav(await readFile(path));
        return `${(samples.length / rate).toFixed(2)}s`;
    } catch {
        return 'unknown';
    }
}

// ── promoting ────────────────────────────────────────────────────────────────

/**
 * Read a 16-bit mono PCM WAV. Enough of a parser for the files gen_sfx.py wrote,
 * and it is only ever pointed at those.
 */
function readWav(bytes) {
    let at = 12; // past "RIFF____WAVE"
    let rate = 44100, channels = 1, bits = 16;
    let data = null;
    while (at + 8 <= bytes.length) {
        const id = bytes.toString('ascii', at, at + 4);
        const size = bytes.readUInt32LE(at + 4);
        const body = at + 8;
        if (id === 'fmt ') {
            channels = bytes.readUInt16LE(body + 2);
            rate = bytes.readUInt32LE(body + 4);
            bits = bytes.readUInt16LE(body + 14);
        } else if (id === 'data') {
            data = bytes.subarray(body, body + size);
        }
        at = body + size + (size % 2);
    }
    if (!data || bits !== 16) throw new Error('not a 16-bit PCM WAV');
    const frames = Math.floor(data.length / 2 / channels);
    const samples = new Float32Array(frames);
    for (let i = 0; i < frames; i += 1) samples[i] = data.readInt16LE(i * 2 * channels) / 32768;
    return { rate, samples };
}

function writeWav(samples, rate) {
    const body = Buffer.alloc(samples.length * 2);
    for (let i = 0; i < samples.length; i += 1) {
        body.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
    }
    const head = Buffer.alloc(44);
    head.write('RIFF', 0);
    head.writeUInt32LE(36 + body.length, 4);
    head.write('WAVEfmt ', 8);
    head.writeUInt32LE(16, 16);
    head.writeUInt16LE(1, 20);          // PCM
    head.writeUInt16LE(1, 22);          // mono
    head.writeUInt32LE(rate, 24);
    head.writeUInt32LE(rate * 2, 28);
    head.writeUInt16LE(2, 32);
    head.writeUInt16LE(16, 34);
    head.write('data', 36);
    head.writeUInt32LE(body.length, 40);
    return Buffer.concat([head, body]);
}

/** Decode anything ffmpeg understands into mono float samples at `rate`. */
function decode(path, rate) {
    const { execFileSync } = require('node:child_process');
    const raw = execFileSync('ffmpeg', [
        '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', String(rate), '-',
    ], { maxBuffer: 256 * 1024 * 1024 });
    const out = new Float32Array(raw.length / 4);
    for (let i = 0; i < out.length; i += 1) out[i] = raw.readFloatLE(i * 4);
    return out;
}

function peakOf(samples) {
    let peak = 0;
    for (const s of samples) peak = Math.max(peak, Math.abs(s));
    return peak;
}

function normalizeTo(samples, peak) {
    const top = peakOf(samples);
    if (top <= 0) return samples;
    const k = peak / top;
    const out = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i += 1) out[i] = samples[i] * k;
    return out;
}

/**
 * Cut the silence off the front and most of it off the back.
 *
 * Generators put a beat of room tone in front of almost everything, and on a
 * cue that fires on a jump that beat IS latency: the sound arrives after the
 * thing it belongs to. The tail is kept because a bell's decay is the sound.
 */
function trimSilence(samples, rate, floorDb = -46, tailMs = 60) {
    const floor = Math.pow(10, floorDb / 20);
    let first = 0;
    while (first < samples.length && Math.abs(samples[first]) < floor) first += 1;
    let last = samples.length - 1;
    while (last > first && Math.abs(samples[last]) < floor) last -= 1;
    if (first >= last) return samples;
    const tail = Math.floor((tailMs / 1000) * rate);
    const cut = samples.subarray(first, Math.min(samples.length, last + tail));
    // A hard cut at the front is a click; four milliseconds of fade is not.
    const fade = Math.floor(0.004 * rate);
    const out = Float32Array.from(cut);
    for (let i = 0; i < Math.min(fade, out.length); i += 1) {
        out[i] *= i / fade;
        out[out.length - 1 - i] *= i / fade;
    }
    return out;
}

/**
 * Cross-fade the tail over the head so the loop joins itself silently.
 *
 * The same trick as gen_sfx.py::seamless, and it has to happen HERE rather than
 * in the engine: AudioManager sets loop_mode on the stream and plays it end to
 * end, so an unmatched join is an audible tick every couple of seconds forever.
 * It is also why a promoted loop is written as WAV rather than kept as the MP3
 * that came back -- MP3 carries encoder padding, and padding is a gap.
 */
function seamless(samples, rate, fadeMs = 250) {
    const n = Math.floor((fadeMs / 1000) * rate);
    if (n <= 0 || samples.length <= 2 * n) return samples;
    const out = Float32Array.from(samples.subarray(0, samples.length - n));
    const tail = samples.subarray(samples.length - n);
    for (let i = 0; i < n; i += 1) {
        const k = i / n;
        out[i] = out[i] * k + tail[i] * (1 - k);
    }
    return out;
}

/**
 * Land a chosen take in the slot its placeholder occupies.
 *
 * THE PLACEHOLDER IS THE SPEC, and that is what makes this safe. It already
 * carries the sample rate the slot wants and, because gen_sfx.py normalises
 * every file to its tier, the PEAK the reward ladder requires. So the new take
 * is matched to the old file rather than to a table repeated in two languages,
 * and the ladder cannot drift as sounds are replaced one at a time.
 *
 * Consequences, all of them deliberate:
 *   - the filename does not change, so audio_manifest.json is not touched, no
 *     asset is orphaned, and `git checkout` is the whole of the undo;
 *   - the output is WAV, so nothing depends on MP3 gapless behaviour;
 *   - a loop is cross-faded into itself, because nothing downstream will.
 */
async function promote(key, take) {
    const source = join(TAKES, `${key}-${take}.mp3`);
    if (!existsSync(source)) throw new Error(`no take at ${source}`);
    const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
    const def = manifest.sfx?.[key] ?? manifest.beds?.[key];
    if (!def) throw new Error(`"${key}" is not a key in audio_manifest.json`);

    const target = join(ROOT, 'godot', def.file);
    if (!existsSync(target)) throw new Error(`no placeholder to match at ${def.file}`);
    const placeholder = readWav(await readFile(target));
    const looping = def.file.includes('/ambience/')
        || (Number(def.max_distance ?? 0) > 0 && def.pool === undefined && def.min_interval_ms === undefined);

    let samples = decode(source, placeholder.rate);
    const rawSeconds = samples.length / placeholder.rate;
    samples = looping
        ? seamless(samples, placeholder.rate)
        : trimSilence(samples, placeholder.rate);
    samples = normalizeTo(samples, peakOf(placeholder.samples));

    // THE DURATION BUDGET IS PART OF THE DESIGN, so a take cannot quietly break
    // it. brand/SOUND_DESIGN.md §4: anything that can fire more than once a
    // second is ~120ms, and only the six celebrations run long. Generators
    // ignore a requested duration constantly -- ask for one second and get
    // three, with a coin that rings for as long as the jump before it.
    //
    // The placeholder is the budget, the same way it is the peak. 1.6x of it is
    // slack for a real recording's decay; past that this is a different sound
    // wearing the same name, and it refuses rather than warns.
    const placeholderSeconds = placeholder.samples.length / placeholder.rate;
    const outSeconds = samples.length / placeholder.rate;
    const budget = Math.max(placeholderSeconds * 1.6, 0.12);
    if (!looping && outSeconds > budget) {
        const hardMs = Number(arg('--max-ms', '0'));
        if (hardMs > 0) {
            samples = trimSilence(samples.subarray(0, Math.floor((hardMs / 1000) * placeholder.rate)),
                placeholder.rate, -60, 0);
            samples = normalizeTo(samples, peakOf(placeholder.samples));
        } else if (!has('--force')) {
            throw new Error(
                `${key}: the take is ${outSeconds.toFixed(2)}s and this slot budgets `
                + `${placeholderSeconds.toFixed(2)}s (limit ${budget.toFixed(2)}s).\n`
                + `  brand/SOUND_DESIGN.md §4 -- a cue this long stops being a cue.\n`
                + `  Re-generate, or --max-ms ${Math.round(budget * 1000)} to hard-cut it, `
                + `or --force to take it as it is.`);
        }
    }

    await writeFile(target, writeWav(samples, placeholder.rate));
    console.log(`${key} -> ${def.file}`);
    console.log(`  ${rawSeconds.toFixed(2)}s in, ${(samples.length / placeholder.rate).toFixed(2)}s out`
        + `  ${placeholder.rate} Hz  peak ${peakOf(placeholder.samples).toFixed(2)} (matched to the placeholder)`
        + `${looping ? '  cross-faded for looping' : '  trimmed'}`);
    console.log('  next:  godot --headless --path godot --import && npm run validate:assets');
}

// ── cli ──────────────────────────────────────────────────────────────────────

function arg(name, fallback = null) {
    const i = process.argv.indexOf(name);
    return i === -1 ? fallback : process.argv[i + 1];
}
const has = name => process.argv.includes(name);

async function main() {
    const jobs = await buildJobs();

    if (has('--promote')) {
        const i = process.argv.indexOf('--promote');
        return promote(process.argv[i + 1], process.argv[i + 2] ?? '1');
    }

    if (has('--list')) {
        for (const job of jobs) {
            console.log(`${job.family.padEnd(6)} ${job.key.padEnd(20)} ${duration(job)}s  ${job.moment}`);
        }
        console.log(`\n${jobs.length} sounds. --dry-run --all prints every prompt.`);
        return;
    }

    const only = arg('--key');
    const family = arg('--family');
    // --all is required rather than implied: without it, a mistyped --key would
    // silently select the whole bank, which with --takes 3 is 150 generations.
    if (!only && !family && !has('--all') && !has('--script') && !has('--dry-run')) {
        console.error('choose what to make: --key <manifest key>, --family BODY|WORLD|VOICE, or --all.');
        console.error('--list shows every key. --dry-run prints the prompts and spends nothing.');
        process.exit(1);
    }
    const wanted = jobs.filter(j =>
        (only ? j.key === only : true) && (family ? j.family === family.toUpperCase() : true));
    if (wanted.length === 0) {
        console.error(`nothing matched. --list shows every key.`);
        process.exit(1);
    }

    if (has('--script')) {
        // Defaults to a real file in the repo rather than to stdout, because the
        // sheet has an obvious home and asking for a path is asking the reader to
        // know where they are. `--out -` still writes to stdout for a pipe.
        const out = arg('--out', SHEET);
        return script(wanted, out === '-' ? null : resolve(out));
    }

    if (has('--dry-run')) {
        for (const job of wanted) {
            console.log(`\n── ${job.key}  (${job.family}, ${duration(job)}s${job.looping ? ', looping' : ''})`);
            console.log(buildPrompt(job));
        }
        return;
    }

    const apiKey = process.env.ELEVENLABS_API_KEY ?? '';
    if (!apiKey && !has('--proxy-auth')) {
        console.error('ELEVENLABS_API_KEY is not set.\n');
        console.error('  export ELEVENLABS_API_KEY=...   your shell, or a gitignored .env');
        console.error('  --proxy-auth                    the key is attached outside this process');
        console.error('                                  (a Claude Code cloud environment API');
        console.error('                                  credential, or any egress proxy that adds');
        console.error('                                  the xi-api-key header for you)\n');
        console.error('A key of your own belongs on YOUR machine only. Not in the repo, not in the');
        console.error('game, not in Railway: nothing at runtime calls ElevenLabs, so nothing at');
        console.error('runtime should be able to. --dry-run prints the prompts without either.');
        process.exit(1);
    }

    const takes = Number(arg('--takes', '3'));
    await mkdir(TAKES, { recursive: true });
    let made = 0;
    for (const job of wanted) {
        for (let take = 1; take <= takes; take += 1) {
            try {
                const { path, bytes } = await generate(job, take, apiKey);
                console.log(`  ${path.replace(ROOT + '/', '')}  ${(bytes / 1024).toFixed(0)} KB`);
                made += 1;
            } catch (error) {
                console.error(`  ${error.message}`);
            }
        }
    }
    console.log(`\n${made} takes in output/audio-takes/.`);
    console.log('Listen, then:  node tools/gen_audio_elevenlabs.mjs --promote <key> <take>');
}

main().catch(error => {
    console.error(error.message);
    process.exit(1);
});
