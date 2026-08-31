#!/usr/bin/env node
/**
 * Turn brand/SOUND_DESIGN.md into real sound effects, via ElevenLabs.
 *
 * Usage:
 *   node tools/gen_audio_elevenlabs.mjs --list
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
 * (gitignored), you listen to them on /audio or in any player, and `--promote`
 * moves the one you chose into the game and repoints the manifest at it. That
 * separation is what stops a bank of forty carefully-ordered sounds being
 * degraded one hasty take at a time.
 */
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(ROOT, 'godot/data/audio/audio_manifest.json');
const EVENTS = join(ROOT, 'godot/data/audio/sound_events.json');
const DOC = join(ROOT, 'brand/SOUND_DESIGN.md');
const TAKES = join(ROOT, 'output/audio-takes');

const ENDPOINT = 'https://api.elevenlabs.io/v1/sound-generation';

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

/** Seconds to ask for. Short for a cue, long enough to be trimmed for a bed. */
function duration(job) {
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

function buildPrompt(job) {
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

async function generate(job, take, apiKey) {
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
        headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
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

// ── promoting ────────────────────────────────────────────────────────────────

/**
 * Move a chosen take into the game.
 *
 * Three edits, all of them reversible with `git checkout`: the file lands beside
 * its siblings, audio_manifest.json is repointed at it, and the placeholder it
 * replaces is deleted. The delete is not optional — tools/validate_assets.js
 * fails on an asset nothing references, which is exactly the check that keeps
 * the tree from filling up with superseded sounds.
 */
async function promote(key, take) {
    const source = join(TAKES, `${key}-${take}.mp3`);
    if (!existsSync(source)) throw new Error(`no take at ${source}`);
    const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
    const section = manifest.sfx?.[key] ? 'sfx' : manifest.beds?.[key] ? 'beds' : null;
    if (!section) throw new Error(`"${key}" is not a key in audio_manifest.json`);

    const oldFile = manifest[section][key].file;
    const newFile = oldFile.replace(/\.[a-z0-9]+$/i, '.mp3');
    await writeFile(join(ROOT, 'godot', newFile), await readFile(source));
    if (newFile !== oldFile) {
        manifest[section][key].file = newFile;
        await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
        for (const stale of [join(ROOT, 'godot', oldFile), join(ROOT, 'godot', oldFile + '.import')]) {
            await rm(stale, { force: true });
        }
    }
    console.log(`promoted ${key}: ${oldFile} -> ${newFile}`);
    console.log('  next:  godot --headless --path godot --import');
    console.log('         npm run validate:assets && bash godot/tools/build_web.sh');
    if (section === 'beds' || Number(manifest.sfx?.[key]?.max_distance ?? 0) > 0) {
        console.log('  NOTE: this one LOOPS. MP3 carries encoder padding, so the join will tick.');
        console.log('        Re-encode and cross-fade before shipping it, e.g.:');
        console.log(`        ffmpeg -i ${newFile} -af "afade=t=in:d=0.25,afade=t=out:st=<end-0.25>:d=0.25" -ar 22050 -ac 1 out.wav`);
    }
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
    if (!only && !family && !has('--all')) {
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

    if (has('--dry-run')) {
        for (const job of wanted) {
            console.log(`\n── ${job.key}  (${job.family}, ${duration(job)}s${job.looping ? ', looping' : ''})`);
            console.log(buildPrompt(job));
        }
        return;
    }

    const apiKey = process.env.ELEVENLABS_API_KEY ?? '';
    if (!apiKey) {
        console.error('ELEVENLABS_API_KEY is not set.\n');
        console.error('  export ELEVENLABS_API_KEY=...       (your shell, or a gitignored .env)\n');
        console.error('It belongs on YOUR machine only. Not in the repo, not in the game, not in');
        console.error('Railway: nothing at runtime calls ElevenLabs, so nothing at runtime should');
        console.error('be able to. Run with --dry-run to see the prompts without a key.');
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
