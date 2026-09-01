#!/usr/bin/env node
/**
 * Turn brand/SOUND_DESIGN.md into real sound effects, via ElevenLabs.
 *
 * Usage:
 *   node tools/gen_audio_elevenlabs.mjs --check           # key + network, costs nothing
 *   node tools/gen_audio_elevenlabs.mjs --family BODY --takes 3      # one family
 *   node tools/gen_audio_elevenlabs.mjs --all --takes 3 --yes        # the lot, resumable
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

/**
 * Overridable so the retry and throttle logic can be tested against a local mock
 * that returns 429s on demand. Nothing else should ever set it.
 */
const BASE = process.env.CROW_ELEVENLABS_BASE ?? 'https://api.elevenlabs.io';

const ENDPOINT = `${BASE}/v1/sound-generation`;

/**
 * THE PROMPT BUDGET, and it is a hard API limit rather than a style preference:
 * /v1/sound-generation rejects anything over 450 characters outright, with
 * `text_too_long` and no partial credit. /v1/music is a different model with a
 * different cap (4100), so a song is never in danger and only the effects are.
 *
 * 450 is small. It is roughly two sentences of house style, one of family
 * character, and whatever is left for the sound itself -- which is why
 * `buildPrompt` spends it in priority order rather than assembling a string and
 * hoping. Both numbers were measured against the live API, not read off a page.
 */
const MAX_SFX_PROMPT = 450;
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
const MUSIC_ENDPOINT = `${BASE}/v1/music`;

/**
 * The house style, prepended to every prompt.
 *
 * Text-to-audio models drift toward cinema: everything arrives big, wet and
 * three seconds long. Every clause here is load-bearing against that, and they
 * are the same rules brand/SOUND_DESIGN.md states for a human.
 *
 * TERSE ON PURPOSE. This block used to read like prose and spent 300 of the 450
 * characters available, which left nothing for the sound itself. Every
 * constraint it made is still made -- audience, dryness, warmth, no speech,
 * instant onset -- in a third of the room. A generator is not the reader who
 * needs a sentence to flow, and brand/SOUND_DESIGN.md still keeps the long form
 * for the reader who does.
 */
const HOUSE = [
    'Game sound effect for children aged 5-8.',
    'Dry, close, mono, no reverb, no music.',
    'Warm, never harsh or scary.',
    'No speech, no animal cry, no boom.',
    'Starts instantly.',
].join(' ');

/**
 * The per-family character. This is the part a generic prompt cannot know and
 * the part that makes forty separate generations sound like one game.
 */
const FAMILY_STYLE = {
    BODY: 'A small wind-up tin bird: felt, soft metal, tiny servo. '
        + 'Toy-like, mid-low, dry, physical. Not a real bird, not a weapon.',
    WORLD: 'A storybook object: wood, air, glass, leaves or water. '
        + 'Soft-edged, distant, behind the action.',
    VOICE: 'Tuned percussion: glockenspiel, celeste or music box. '
        + 'Bell-like, natural decay, C major pentatonic.',
    OTHER: 'Soft, musical, unobtrusive.',
};

/**
 * The tail clauses, named so their cost against MAX_SFX_PROMPT is countable.
 *
 * These outrank the brief. A looping bed that arrives as a one-shot is unusable
 * whatever else the prompt said, and the two CRITICAL rails are in the file
 * precisely because the model ignores them when they are buried -- so they are
 * reserved out of the budget first and the brief takes what is left.
 */
const LOOPING = 'A continuous even texture: no beginning, no end, no dominant event, seamlessly loopable.';
const ONE_SHOT = 'One single short event, not a sequence or loop.';
const CRITICAL = {
    wrong: 'CRITICAL: not failure. No buzzer, no descending wah, no error tone. Flat, low, soft, short.',
    door_locked: 'CRITICAL: not a buzzer, not an error. Two gentle knocks on warm wood.',
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

/**
 * As much of the brief as the budget has left, cut at a sentence boundary.
 *
 * A half-sentence is worse than no sentence: "a soft wooden knock, then a" tells
 * the model to make something it cannot finish. So whole sentences are kept
 * while they fit and the rest is dropped, in the order the doc wrote them --
 * the first sentence of a brief is reliably the one describing the sound, and
 * the later ones are reliably the qualifications.
 */
function fitBrief(fixed, brief) {
    let room = MAX_SFX_PROMPT - fixed - 1;
    const kept = [];
    for (const sentence of brief.split(/(?<=[.!?])\s+/)) {
        if (!sentence.trim()) continue;
        const cost = sentence.length + (kept.length ? 1 : 0);
        if (cost > room) break;
        kept.push(sentence);
        room -= cost;
    }
    return kept.join(' ');
}

/**
 * The prompt, assembled in priority order against MAX_SFX_PROMPT.
 *
 * The rails -- house style, family character, the moment, loop-or-one-shot, and
 * a CRITICAL note where there is one -- are reserved first, because each of them
 * changes what the model makes rather than merely describing it. The brief then
 * takes whatever is left. That ordering is the whole design: when a prompt runs
 * out of room it loses detail about the sound, never the rules that keep fifty
 * separate generations sounding like one game.
 */
function buildPrompt(job) {
    if (job.family === 'MUSIC') return buildMusicPrompt(job);

    const head = [HOUSE, FAMILY_STYLE[job.family], job.moment + '.'];
    const tail = [job.looping ? LOOPING : ONE_SHOT, CRITICAL[job.key]].filter(Boolean);

    const fixed = [...head, ...tail].join(' ').length;
    // A job whose rails alone do not fit is a bug in the rails, not a prompt to
    // send: the API would take the money for a 400. Fail here, where --dry-run
    // finds it, rather than at request time.
    if (fixed >= MAX_SFX_PROMPT) {
        throw new Error(`${job.key}: rails alone are ${fixed} chars, over the ${MAX_SFX_PROMPT} limit.`);
    }

    const brief = promptableBrief(job.brief);
    const kept = fitBrief(fixed, brief);
    if (brief && !kept) {
        // THE FAMILY YIELDS TO THE BRIEF when there is only room for one, and the
        // ambience beds are why. Their whole identity lives in the brief -- "a
        // crystal cave, low room tone, occasional glass drips" -- while the WORLD
        // style says only "a storybook object, soft-edged, distant". Squeeze the
        // brief out of all five and they become the same prompt under five names,
        // which is the one outcome worse than losing the house voice on one job.
        const bare = [HOUSE, job.moment + '.'];
        const rescued = fitBrief([...bare, ...tail].join(' ').length, brief);
        if (rescued) return [...bare, rescued, ...tail].join(' ');
    }

    return [...head, kept, ...tail].filter(Boolean).join(' ');
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
    const bytes = await request(ENDPOINT, {
        text: buildPrompt(job),
        duration_seconds: duration(job),
        // Low influence lets the model make something musical; high influence
        // makes it follow the words literally and, in practice, blandly. 0.4 is
        // the setting that kept the brief without flattening the result.
        prompt_influence: 0.4,
    }, apiKey, `${job.key} take ${take}`);
    const path = join(TAKES, `${job.key}-${take}.mp3`);
    await writeFile(path, bytes);
    return { path, bytes: bytes.length };
}

/**
 * The throttle. ElevenLabs rate-limits hard, and a batch of 174 is exactly the
 * shape that trips it.
 *
 * Three mechanisms, because concurrency alone is not enough: four workers with
 * no spacing still fire four requests in the same millisecond, and a limiter
 * measures arrivals per second rather than how many are in flight.
 *
 *  1. A MINIMUM GAP between request STARTS, shared across the workers. This is
 *     the stagger, and it is what a per-second limiter actually responds to.
 *  2. RETRY ON 429, honouring Retry-After when the response carries it, with
 *     exponential backoff and jitter when it does not. Jitter matters: without
 *     it every worker that got a 429 wakes up together and trips it again.
 *  3. AN ADAPTIVE GAP. Every 429 widens the gap and it narrows back after a run
 *     of successes, so a long batch converges on whatever pace the account is
 *     actually allowed rather than on a number guessed here.
 */
const throttle = {
    gapMs: 600,
    minGapMs: 250,
    maxGapMs: 8000,
    nextAt: 0,
    okStreak: 0,
    backoffs: 0,

    /** Wait for this request's turn in the shared stagger. */
    async slot() {
        const now = Date.now();
        const at = Math.max(now, this.nextAt);
        this.nextAt = at + this.gapMs;
        if (at > now) await sleep(at - now);
    },

    /** A 429: slow everything down, not just this worker. */
    widen() {
        this.backoffs += 1;
        this.okStreak = 0;
        this.gapMs = Math.min(this.maxGapMs, Math.round(this.gapMs * 1.8));
    },

    /** Ten clean requests in a row: try a little faster again. */
    narrow() {
        this.okStreak += 1;
        if (this.okStreak >= 10) {
            this.okStreak = 0;
            this.gapMs = Math.max(this.minGapMs, Math.round(this.gapMs * 0.8));
        }
    },
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * One request, with the rate limiter respected rather than fought.
 *
 * Retries only on 429 and 5xx. A 401 or a 422 will fail identically forever, and
 * retrying it just spends the budget faster on the same mistake.
 */
async function request(url, body, apiKey, label, attempts = 5) {
    for (let attempt = 1; ; attempt += 1) {
        await throttle.slot();
        let response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: { ...authHeader(apiKey), 'content-type': 'application/json' },
                body: JSON.stringify(body),
            });
        } catch (error) {
            if (attempt >= attempts) throw new Error(`${label}: ${error.message}`);
            await sleep(1000 * attempt);
            continue;
        }
        if (response.ok) {
            throttle.narrow();
            return Buffer.from(await response.arrayBuffer());
        }

        const retryable = response.status === 429 || response.status >= 500;
        const detail = (await response.text().catch(() => '')).slice(0, 300);
        if (!retryable || attempt >= attempts) {
            const hint = response.status === 401 ? ' — the key is not valid'
                : response.status === 429 ? ' — still rate-limited after backing off; try --gap-ms 2000'
                : '';
            throw new Error(`${label}: HTTP ${response.status}${hint} ${detail}`);
        }
        if (response.status === 429) throttle.widen();
        // Retry-After is what the server actually wants; the backoff is only for
        // when it does not say. Jitter so the workers do not resynchronise.
        const header = Number(response.headers.get('retry-after'));
        const waitMs = Number.isFinite(header) && header > 0
            ? header * 1000
            : Math.min(30000, 800 * 2 ** attempt) + Math.random() * 400;
        console.log(`      ${label}: ${response.status}, waiting ${(waitMs / 1000).toFixed(1)}s `
            + `(gap now ${throttle.gapMs}ms)`);
        await sleep(waitMs);
    }
}

/** A song, from the music model. See MUSIC_ENDPOINT for what is unverified. */
async function generateMusic(job, take, apiKey) {
    let bytes;
    try {
        bytes = await request(MUSIC_ENDPOINT,
            { prompt: buildPrompt(job), music_length_ms: duration(job) * 1000 },
            apiKey, `${job.key} take ${take}`);
    } catch (error) {
        throw new Error(`${error.message}\n`
            + '    The music endpoint is unverified from this repo -- check the current '
            + 'ElevenLabs docs, or use --script and paste the prompt into the browser.');
    }
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

/**
 * Prove the key works and the host is reachable, before spending anything.
 *
 * The first run of a batch job is the one that fails, and it fails for one of
 * three boring reasons: no key, a network that will not let you out, or a key
 * that is not valid. Each needs a different fix and a 403 on request one of 174
 * does not tell you which. This asks the account endpoint, which costs no
 * credits, and reports what is left.
 */
async function check() {
    const apiKey = process.env.ELEVENLABS_API_KEY ?? '';
    if (!apiKey && !has('--proxy-auth')) {
        console.error('no ELEVENLABS_API_KEY, and no --proxy-auth. Nothing to check.');
        process.exit(1);
    }
    console.log(`key    : ${apiKey ? apiKey.slice(0, 6) + '…' + ` (${apiKey.length} chars)` : 'attached by a proxy'}`);
    let response;
    try {
        response = await fetch(`${BASE}/v1/user/subscription`,
            { headers: authHeader(apiKey) });
    } catch (error) {
        console.error(`network: CANNOT REACH api.elevenlabs.io — ${error.message}`);
        console.error('         a proxy or firewall is refusing the connection, not ElevenLabs.');
        process.exit(1);
    }
    if (!response.ok) {
        const body = await response.text().catch(() => '');
        // A CORPORATE OR SANDBOX PROXY answers 403 to the CONNECT and its body
        // talks about allowlists, which is a completely different problem from
        // ElevenLabs refusing a key -- and calling it "reachable" sends whoever
        // hit it to check their key when the key is fine.
        const proxied = /allowlist|egress|not allowed|policy|forbidden by proxy/i.test(body);
        if (proxied) {
            console.error(`network: BLOCKED BEFORE IT LEFT THIS MACHINE — ${body.slice(0, 160)}`);
            console.error('         a proxy or firewall is refusing the host, not ElevenLabs.');
            console.error('         Your key was never sent. Run this where the host is reachable,');
            console.error('         or allow api.elevenlabs.io in the network policy.');
            process.exit(1);
        }
        console.error(`auth   : HTTP ${response.status} ${body.slice(0, 200)}`);
        console.error(response.status === 401
            ? '         reachable, but the key is not valid. Check it, or make a new one.'
            : '         reachable, but the request was refused. The body above says why.');
        process.exit(1);
    }
    const sub = await response.json();
    const used = sub.character_count, limit = sub.character_limit;
    console.log(`network: reachable`);
    console.log(`auth   : OK`);
    console.log(`tier   : ${sub.tier ?? 'unknown'} (${sub.status ?? 'unknown'})`);
    if (Number.isFinite(used) && Number.isFinite(limit)) {
        console.log(`credits: ${limit - used} left of ${limit}`);
    }
    console.log('\nReady. The whole bank at three takes each:');
    console.log('  node tools/gen_audio_elevenlabs.mjs --all --takes 3');
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

    if (has('--check')) return check();

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

    // THE WHOLE BANK IS 174 REQUESTS at three takes, so this is a batch job and
    // has to behave like one: it resumes, it runs several at once, and it says
    // where it is. A sequential loop that starts over from zero when the wifi
    // drops at request 140 is not a tool anybody runs twice.
    const plan = [];
    for (const job of wanted) {
        for (let take = 1; take <= takes; take += 1) {
            if (!has('--force') && existsSync(join(TAKES, `${job.key}-${take}.mp3`))) continue;
            plan.push({ job, take });
        }
    }
    const already = wanted.length * takes - plan.length;
    if (plan.length === 0) {
        console.log(`Nothing to do: all ${already} takes are already in output/audio-takes/.`);
        console.log('--force regenerates them.');
        return;
    }

    // A BUDGET GUARD, because every request costs credits and a mistyped
    // selector is the expensive mistake: `--all --takes 5` is 290 generations
    // and reads almost exactly like `--key x --takes 5`. Anything past the cap
    // has to be asked for twice.
    const cap = Number(arg('--max-requests', '40'));
    if (plan.length > cap && !has('--yes')) {
        console.error(`${plan.length} generations is more than --max-requests (${cap}).`);
        console.error('That is real money on a metered account, so it needs saying twice:');
        console.error(`  add --yes to run all ${plan.length}`);
        console.error(`  or --max-requests ${plan.length} to raise the cap deliberately`);
        console.error('  or narrow it: --family BODY, --family WORLD, --family VOICE, --key <one>');
        console.error('\nA good first batch is one family at a time.');
        process.exit(1);
    }

    console.log(`${plan.length} generation(s) across ${wanted.length} sound(s)`
        + `${already ? `, skipping ${already} already there` : ''}.`);

    // Two, not four. The account is rate-limited aggressively enough that the
    // stagger below does the real pacing; more workers only means more of them
    // waiting on the same shared gap.
    const concurrency = Math.max(1, Number(arg('--concurrency', '2')));
    throttle.gapMs = Math.max(0, Number(arg('--gap-ms', String(throttle.gapMs))));
    console.log(`${concurrency} at a time, ${throttle.gapMs}ms apart, backing off on 429.`);
    const failures = [];
    let done = 0;
    let made = 0;
    let consecutiveFailures = 0;
    let aborted = false;

    // A small worker pool rather than Promise.all over everything: 174 requests
    // fired at once is a rate limit, and a rate limit mid-batch is 174 failures.
    const queue = plan.slice();
    async function worker() {
        for (;;) {
            const item = queue.shift();
            if (!item) return;
            const { job, take } = item;
            const at = `[${String(++done).padStart(3)}/${plan.length}]`;
            try {
                const { path, bytes } = await generate(job, take, apiKey);
                made += 1;
                consecutiveFailures = 0;
                console.log(`${at} ${path.replace(ROOT + '/', '')}  ${(bytes / 1024).toFixed(0)} KB`);
            } catch (error) {
                failures.push({ key: job.key, take, message: error.message });
                console.error(`${at} FAILED ${job.key} take ${take}`);
                // A run that has failed five times in a row is not unlucky, it is
                // wrong: a bad key, a dead quota, a changed endpoint. Grinding
                // through the remaining 169 spends the budget proving it.
                if ((consecutiveFailures += 1) >= 5) {
                    if (!aborted) {
                        aborted = true;
                        queue.length = 0;
                        console.error('\n  five failures in a row — stopping rather than spending '
                            + 'the rest of the batch on the same error.');
                    }
                    return;
                }
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, plan.length) }, worker));

    console.log(`\n${made} take(s) in output/audio-takes/.`);
    if (failures.length) {
        console.log(`${failures.length} failed:`);
        // Grouped, because 174 copies of one rate-limit message is not a report.
        const byMessage = new Map();
        for (const f of failures) {
            const short = f.message.split('\n')[0].slice(0, 160);
            byMessage.set(short, [...(byMessage.get(short) ?? []), `${f.key}-${f.take}`]);
        }
        for (const [message, keys] of byMessage) {
            console.log(`  ${keys.length}x  ${message}`);
            console.log(`        ${keys.slice(0, 8).join(' ')}${keys.length > 8 ? ' …' : ''}`);
        }
        console.log('\nRe-run the same command: what succeeded is skipped, only the gaps retry.');
    }
    console.log('\nListen on /audio, or with any player, then:');
    console.log('  node tools/gen_audio_elevenlabs.mjs --promote <key> <take>');
    console.log('  npm run audio:audit');
}

main().catch(error => {
    console.error(error.message);
    process.exit(1);
});
