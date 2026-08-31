import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

/**
 * The audio review library: what /audio is looking at.
 *
 * The game's audio is three data files and a directory of samples, all of which
 * live in the Godot tree. This reads them where they actually are rather than
 * duplicating any of it, so the page can never drift from the game:
 *
 *   sound_events.json    moment -> key
 *   audio_manifest.json  key    -> file + mix
 *   brand/SOUND_DESIGN.md  the BRIEF, per moment, which is the only column a
 *                          generator cannot produce and the only reason a human
 *                          opens this page at all
 *
 * WHY THE API SERVES THIS AND NOT THE WEB CONTAINER. The samples are inside
 * index.pck in the web build -- extractable, but not addressable, so a browser
 * cannot fetch one to play it. Copying them into the API image (see
 * deploy/api/Dockerfile) costs ~3 MB and gives every file a URL behind the same
 * password.
 */

/** Candidate roots, in the order they are tried. First hit wins. */
function firstExisting(candidates: string[]): string | null {
    for (const c of candidates) {
        if (c && existsSync(c)) return resolve(c);
    }
    return null;
}

/**
 * Where the sample tree is.
 *
 * Three shapes, and all three are real: the Docker image (COPY puts it at
 * /app/audio), a dev server started from `server/`, and one started from the
 * repo root. CROW_AUDIO_ROOT overrides all of them.
 */
export function audioRoot(): string | null {
    return firstExisting([
        process.env['CROW_AUDIO_ROOT'] ?? '',
        join(process.cwd(), 'audio'),
        join(process.cwd(), '..', 'godot', 'assets', 'audio'),
        join(process.cwd(), 'godot', 'assets', 'audio'),
    ]);
}

function dataRoot(): string | null {
    return firstExisting([
        process.env['CROW_AUDIO_DATA_ROOT'] ?? '',
        join(process.cwd(), 'audio-data'),
        join(process.cwd(), '..', 'godot', 'data', 'audio'),
        join(process.cwd(), 'godot', 'data', 'audio'),
    ]);
}

/**
 * Where `npm run audio:gen` leaves its takes.
 *
 * Present when the bench runs beside the repo, which is when you are actually
 * choosing between versions; absent in the deployed API image, because takes are
 * gitignored working material and have no business in a container. So this
 * resolves to null there and every sound simply reports no takes — the page
 * degrades to what it was rather than erroring.
 */
export function takesRoot(): string | null {
    return firstExisting([
        process.env['CROW_AUDIO_TAKES_ROOT'] ?? '',
        join(process.cwd(), 'audio-takes'),
        join(process.cwd(), '..', 'output', 'audio-takes'),
        join(process.cwd(), 'output', 'audio-takes'),
    ]);
}

function designDoc(): string | null {
    return firstExisting([
        process.env['CROW_SOUND_DESIGN_DOC'] ?? '',
        join(process.cwd(), 'SOUND_DESIGN.md'),
        join(process.cwd(), '..', 'brand', 'SOUND_DESIGN.md'),
        join(process.cwd(), 'brand', 'SOUND_DESIGN.md'),
    ]);
}

export interface SoundEntry {
    /** The gameplay moment, e.g. "coin". Absent for beds and music. */
    event: string | null;
    /** The manifest key, e.g. "coin_collect". */
    key: string;
    /** Which of the three families, from the doc's own section headings. */
    family: string;
    /** sfx | loop | bed | music */
    kind: string;
    /** The mix, verbatim from audio_manifest.json. */
    mix: Record<string, unknown>;
    /** What this moment is FOR, from brand/SOUND_DESIGN.md. */
    brief: string;
    /** The code that plays it, from the same table. */
    firesFrom: string;
    bytes: number | null;
    missing: boolean;
    /** Take numbers waiting in output/audio-takes/ for this key, ascending. */
    takes: number[];
}

export interface AudioLibrary {
    mix: Record<string, unknown>;
    sounds: SoundEntry[];
    /** Moments registered with no row in the doc, and rows with no moment. */
    warnings: string[];
}

/**
 * Pull the per-moment brief out of brand/SOUND_DESIGN.md.
 *
 * The doc's tables are the same ones check_hardcoding.py already gates in both
 * directions, so every registered moment is guaranteed to have a row here and
 * this cannot silently come back empty. The family comes from the `###` heading
 * the row sits under, which is why the doc groups its tables by family rather
 * than listing forty rows in one.
 */
function parseDesignDoc(markdown: string): Map<string, { family: string; firesFrom: string; brief: string }> {
    const out = new Map<string, { family: string; firesFrom: string; brief: string }>();
    let family = 'Other';
    for (const line of markdown.split('\n')) {
        const heading = /^###\s+(.+?)\s*$/.exec(line);
        if (heading?.[1]) {
            family = heading[1].replace(/\s*—.*$/, '').trim();
            continue;
        }
        // | Moment | `event` | Fires from | Should sound like |
        const row = /^\|([^|]*)\|\s*`([a-z_]+)`\s*\|([^|]*)\|([^|]*)\|/.exec(line);
        if (!row?.[2]) continue;
        out.set(row[2].trim(), {
            family,
            firesFrom: plain(row[3] ?? ''),
            brief: plain(row[4] ?? ''),
        });
    }
    return out;
}

/**
 * Markdown out, prose in.
 *
 * The doc is written to be read as markdown, so a brief carries backticks and
 * the *(at)* / *(loop)* markers the table uses. Rendering those raw in the page
 * puts punctuation in front of the one sentence the reader came for.
 */
function plain(cell: string): string {
    return cell
        .replace(/`/g, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .trim();
}

function num(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Read everything /audio needs, or throw with the reason. */
export async function loadAudioLibrary(): Promise<AudioLibrary> {
    const data = dataRoot();
    const samples = audioRoot();
    if (!data) throw new Error('audio data not found: no sound_events.json / audio_manifest.json on any candidate path');
    if (!samples) throw new Error('audio samples not found: no sfx/ambience/music tree on any candidate path');

    const manifest = JSON.parse(await readFile(join(data, 'audio_manifest.json'), 'utf8')) as Record<string, any>;
    const events = JSON.parse(await readFile(join(data, 'sound_events.json'), 'utf8')) as Record<string, string>;
    const docPath = designDoc();
    const design = docPath ? parseDesignDoc(await readFile(docPath, 'utf8')) : new Map();

    // key -> the moment that plays it. Several moments could in principle share
    // a key; the page shows the moment, so it takes the first and says so.
    const eventForKey = new Map<string, string>();
    for (const [event, key] of Object.entries(events)) {
        if (event.startsWith('_')) continue;
        if (!eventForKey.has(key)) eventForKey.set(key, event);
    }

    const warnings: string[] = [];
    const sounds: SoundEntry[] = [];

    // Which takes exist, read once rather than per sound: the directory holds
    // <key>-<n>.mp3 and a 52-sound bank at three takes each is 156 files.
    const takesByKey = new Map<string, number[]>();
    const takes = takesRoot();
    if (takes) {
        for (const name of await readdir(takes).catch(() => [] as string[])) {
            const m = /^([a-z0-9_]+)-(\d+)\.(mp3|wav|ogg)$/.exec(name);
            if (!m?.[1] || !m[2]) continue;
            const list = takesByKey.get(m[1]) ?? [];
            list.push(Number(m[2]));
            takesByKey.set(m[1], list);
        }
        for (const list of takesByKey.values()) list.sort((a, b) => a - b);
    }

    const add = async (key: string, def: any, kind: string) => {
        const file = String(def?.file ?? '');
        // The manifest path is "assets/audio/sfx/x.wav", relative to the Godot
        // data root; the sample tree here IS assets/audio, so strip that prefix.
        const relative = file.replace(/^assets\/audio\//, '');
        const onDisk = resolve(join(samples, relative));
        // Never trust a path from a file to stay inside the tree, even our own.
        const inside = onDisk === samples || onDisk.startsWith(samples + sep);
        let bytes: number | null = null;
        if (inside) {
            try {
                bytes = (await stat(onDisk)).size;
            } catch {
                bytes = null;
            }
        }
        const event = kind === 'sfx' || kind === 'loop' ? eventForKey.get(key) ?? null : null;
        const doc = design.get(event ?? '') ?? null;
        if (event && !doc) warnings.push(`no brief in brand/SOUND_DESIGN.md for "${event}"`);
        sounds.push({
            event,
            key,
            family: doc?.family ?? (kind === 'bed' ? 'Ambience beds' : kind === 'music' ? 'Music' : 'Other'),
            kind,
            mix: { ...def },
            brief: doc?.brief ?? '',
            firesFrom: doc?.firesFrom ?? '',
            bytes,
            missing: bytes === null,
            takes: takesByKey.get(key) ?? [],
        });
    };

    for (const [key, def] of Object.entries(manifest.sfx ?? {})) {
        if (key.startsWith('_')) continue;
        // A def with a distance and no interval floor is a proximity LOOP: it is
        // attached to a node rather than fired, and the page has to loop it to
        // show what it does. Derived rather than declared, because the manifest
        // does not need a field for something its own shape already says.
        const positional = num((def as any)?.max_distance, 0) > 0;
        const oneShot = (def as any)?.pool !== undefined || (def as any)?.min_interval_ms !== undefined;
        await add(key, def, positional && !oneShot ? 'loop' : 'sfx');
    }
    for (const [key, def] of Object.entries(manifest.beds ?? {})) {
        if (key.startsWith('_')) continue;
        await add(key, def, 'bed');
    }
    for (const [key, def] of Object.entries(manifest.music ?? {})) {
        if (key.startsWith('_')) continue;
        await add(key, def, 'music');
    }

    const mix: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(manifest.mix ?? {})) {
        if (!k.startsWith('_')) mix[k] = v;
    }

    return { mix, sounds, warnings };
}

/**
 * Absolute path of one TAKE, or null.
 *
 * The key is matched against the manifest first, so a take can only be served
 * for a sound that exists, and the resolved path is proved to be inside the
 * takes directory — the same two checks resolveSoundFile makes, for the same
 * reason.
 */
export async function resolveTakeFile(key: string, take: string): Promise<{ path: string; contentType: string } | null> {
    if (!/^[a-z0-9_]{1,64}$/.test(key) || !/^\d{1,4}$/.test(take)) return null;
    const root = takesRoot();
    const data = dataRoot();
    if (!root || !data) return null;
    const manifest = JSON.parse(await readFile(join(data, 'audio_manifest.json'), 'utf8')) as Record<string, any>;
    if (!(manifest.sfx?.[key] ?? manifest.beds?.[key] ?? manifest.music?.[key])) return null;
    for (const [ext, type] of [['mp3', 'audio/mpeg'], ['wav', 'audio/wav'], ['ogg', 'audio/ogg']] as const) {
        const onDisk = resolve(join(root, `${key}-${take}.${ext}`));
        if (onDisk !== root && !onDisk.startsWith(root + sep)) continue;
        if (existsSync(onDisk)) return { path: onDisk, contentType: type };
    }
    return null;
}

/** Absolute path of one sound's file, or null if the key is not ours. */
export async function resolveSoundFile(key: string): Promise<{ path: string; contentType: string } | null> {
    if (!/^[a-z0-9_]{1,64}$/.test(key)) return null;
    const data = dataRoot();
    const samples = audioRoot();
    if (!data || !samples) return null;
    const manifest = JSON.parse(await readFile(join(data, 'audio_manifest.json'), 'utf8')) as Record<string, any>;
    const def = manifest.sfx?.[key] ?? manifest.beds?.[key] ?? manifest.music?.[key];
    const file = String(def?.file ?? '');
    if (!file) return null;
    const onDisk = resolve(join(samples, file.replace(/^assets\/audio\//, '')));
    if (onDisk !== samples && !onDisk.startsWith(samples + sep)) return null;
    if (!existsSync(onDisk)) return null;
    return {
        path: onDisk,
        contentType: onDisk.endsWith('.mp3') ? 'audio/mpeg' : onDisk.endsWith('.ogg') ? 'audio/ogg' : 'audio/wav',
    };
}
