#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m',
};

const ROOT = path.join(__dirname, '..');
const GODOT_ROOT = path.join(ROOT, 'godot');
const AUDIO_MANIFEST_PATH = path.join(ROOT, 'godot', 'data', 'audio', 'audio_manifest.json');
const COMPILED_LEVELS_DIR = path.join(ROOT, 'godot', 'data', 'levels', 'compiled');
const LIVE_ASSET_ROOT = path.join(ROOT, 'godot', 'assets');

const SUSPICIOUS_UNREFERENCED_PATTERNS = [
    { pattern: /\.zip$/i, label: 'archive bundle' },
    { pattern: /Gemini_Generated/i, label: 'generated scratch image' },
    { pattern: /(^|[\\/])crownew/i, label: 'crow experiment export' },
    { pattern: /(^|[\\/])crow1(?:\.2|\.3)?\.png$/i, label: 'legacy crow root frame' },
    { pattern: /(^|[\\/])crow[234]\.png$/i, label: 'legacy crow root frame' },
    { pattern: /^godot\/assets\/sprites\/characters\/crow2\/crow2\//i, label: 'archivable crow2 source folder' },
    { pattern: /^godot\/assets\/sprites\/characters\/crow2\/crowjump\//i, label: 'archivable crowjump source folder' },
    { pattern: /^godot\/assets\/sprites\/characters\/crow2\/crow3\/sprite-64px-9-frames\//i, label: 'archivable extracted frame folder' },
    { pattern: /(^|[\\/])sprite-256px-25\.png$/i, label: 'legacy extracted sprite sheet' },
    { pattern: /(^|[\\/])sprite-64px-9\.png$/i, label: 'legacy extracted sprite sheet' },
    { pattern: /(^|[\\/])coin\.png$/i, label: 'legacy coin experiment' },
    { pattern: /(^|[\\/])coins\.jpg$/i, label: 'legacy coin experiment' },
    { pattern: /(^|[\\/])coins2\.png$/i, label: 'legacy coin experiment' },
    { pattern: /(^|[\\/])door1\.png$/i, label: 'legacy door sprite' },
    { pattern: /(^|[\\/])door2\.png$/i, label: 'legacy door sprite' },
    { pattern: /^godot\/assets\/tilesets\/level1\//i, label: 'archivable tileset source folder' },
    { pattern: /^godot\/assets\/sprites\/levels\/level1\//i, label: 'archivable level art source folder' },
];

function toPosix(value) {
    return value.split(path.sep).join('/');
}

function readText(absolutePath) {
    return fs.readFileSync(absolutePath, 'utf8');
}

function loadJson(absolutePath) {
    return JSON.parse(readText(absolutePath));
}

function walkFiles(directory) {
    const results = [];

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            results.push(...walkFiles(absolutePath));
            continue;
        }

        if (entry.isFile()) {
            results.push(absolutePath);
        }
    }

    return results;
}

function normalizeToLiveAssetPath(assetPath) {
    const normalized = toPosix(assetPath);
    if (normalized.startsWith('godot/')) {
        return normalized;
    }
    const embeddedAssetsPath = normalized.match(/(?:^|\/)(assets\/.+)$/);
    if (embeddedAssetsPath) {
        return `godot/${embeddedAssetsPath[1]}`;
    }
    if (normalized.startsWith('assets/')) {
        return `godot/${normalized}`;
    }
    return normalized;
}

function checkFile(relativePath) {
    const fullPath = path.join(ROOT, relativePath);
    if (!fs.existsSync(fullPath)) {
        return { exists: false, fullPath };
    }

    return {
        exists: true,
        fullPath,
        size: fs.statSync(fullPath).size,
    };
}

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatAssetLabel(relativePath) {
    return relativePath.replace(/^godot\//, '');
}

/**
 * Art slots the game deliberately ships without.
 *
 * Each of these is referenced from a `.gd` constant that is paired with a
 * documented fallback — owl_ring.gd says outright that "the ring falls back to a
 * head crop of the world sprite until it exists", and the two READMEs beside
 * these directories describe them as drop-in slots: put a file here and it is
 * picked up with no code change.
 *
 * The scanner cannot tell an optional slot from a requirement, because both are
 * just a res:// string. So name them here. They are reported as ABSENT rather
 * than MISS: still visible, but not a build failure, because the fallback IS the
 * shipped behaviour. Delete an entry the moment its art lands.
 */
const OPTIONAL_ASSET_SLOTS = new Set([
    'godot/assets/sprites/ui/board/board-9slice.png',
    'godot/assets/sprites/ui/board/count-token-32.png',
    'godot/assets/sprites/ui/hud/owl-icon-32.png',
]);

function printGroup(title, entries, missing) {
    console.log(`\n${colors.cyan}${colors.bold}${title}${colors.reset}`);
    console.log('-'.repeat(60));

    for (const relativePath of entries) {
        const result = checkFile(relativePath);
        const label = formatAssetLabel(relativePath);
        if (result.exists) {
            console.log(`  ${colors.green}OK${colors.reset} ${label.padEnd(42)} (${formatSize(result.size)})`);
        } else if (OPTIONAL_ASSET_SLOTS.has(relativePath)) {
            console.log(`  ${colors.cyan}ABSENT${colors.reset} ${label.padEnd(38)} (optional slot; code falls back)`);
        } else {
            console.log(`  ${colors.red}MISS${colors.reset} ${label}`);
            missing.push(relativePath);
        }
    }
}

/**
 * Every visual asset the game actually references.
 *
 * The Phaser original declared these in one place (a BootScene full of
 * `this.load.image(...)` calls), so this used to be a single-file scrape. Godot
 * has no such chokepoint: a texture is referenced from a `.gd` constant, a
 * `.tscn` ext_resource, a `.tres`, or a data registry. So scan all four for
 * `res://assets/...` and bare `assets/...` paths.
 *
 * Scanning more places than the old version is the point — a single-file scrape
 * would now silently miss most of the real references and report live assets as
 * unreferenced.
 */
function extractReferencedVisualAssets() {
    const sources = [
        ...collectFiles(path.join(GODOT_ROOT, 'scripts'), ['.gd']),
        ...collectFiles(path.join(GODOT_ROOT, 'scenes'), ['.tscn']),
        ...collectFiles(path.join(GODOT_ROOT, 'resources'), ['.tres', '.tscn']),
        ...collectFiles(path.join(GODOT_ROOT, 'data'), ['.json']),
    ];

    const found = new Set();
    for (const file of sources) {
        // Strip GDScript comments first. A path inside a doc comment is an
        // example, not a reference — level_loader.gd documents the Tiled path
        // shape as "../../assets/tilesets/x.png", and counting that as live made
        // validation demand a file that was never supposed to exist.
        const text = path.extname(file) === '.gd'
            ? readText(file).split('\n').filter(line => !line.trim().startsWith('#')).join('\n')
            : readText(file);
        for (const match of text.matchAll(/(?:res:\/\/)?(assets\/[A-Za-z0-9_\-./]+\.(?:png|jpg|jpeg|svg|webp))/g)) {
            found.add(normalizeToLiveAssetPath(match[1]));
        }
    }
    return [...found].sort();
}

/** Recursively list files under dir with one of the given extensions. */
function collectFiles(dir, extensions) {
    if (!fs.existsSync(dir)) return [];
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...collectFiles(full, extensions));
        } else if (extensions.includes(path.extname(entry.name).toLowerCase())) {
            out.push(full);
        }
    }
    return out;
}

function extractManifestAudioAssets() {
    const audioManifest = loadJson(AUDIO_MANIFEST_PATH);
    const sfx = Object.values(audioManifest.sfx || {}).map(entry => normalizeToLiveAssetPath(entry.file));
    const music = Object.values(audioManifest.music || {}).map(entry => normalizeToLiveAssetPath(entry.file));

    return {
        sfx: [...new Set(sfx)].sort(),
        music: [...new Set(music)].sort(),
    };
}

function extractCompiledLevelAssets() {
    const referenced = new Set();

    if (!fs.existsSync(COMPILED_LEVELS_DIR)) {
        return [];
    }

    for (const file of fs.readdirSync(COMPILED_LEVELS_DIR).filter(name => name.endsWith('.json'))) {
        const absolutePath = path.join(COMPILED_LEVELS_DIR, file);
        const compiled = loadJson(absolutePath);
        for (const tileset of compiled.tilesets || []) {
            if (!tileset.image) {
                continue;
            }
            const normalized = normalizeToLiveAssetPath(tileset.image);
            if (normalized.startsWith('godot/assets/')) {
                referenced.add(normalized);
                continue;
            }

            const resolved = path.resolve(path.dirname(absolutePath), tileset.image);
            referenced.add(toPosix(path.relative(ROOT, resolved)));
        }
    }

    return [...referenced].sort();
}

function findSuspiciousUnreferencedAssets(referencedAssets) {
    if (!fs.existsSync(LIVE_ASSET_ROOT)) {
        return [];
    }

    const referenced = new Set(referencedAssets);
    const allAssets = walkFiles(LIVE_ASSET_ROOT).map(file => toPosix(path.relative(ROOT, file)));

    return allAssets
        .filter(relativePath => !referenced.has(relativePath))
        .map(relativePath => {
            const hit = SUSPICIOUS_UNREFERENCED_PATTERNS.find(entry => entry.pattern.test(relativePath));
            return hit ? { relativePath, label: hit.label } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function main() {
    console.log('\n' + '='.repeat(60));
    console.log(`${colors.cyan}${colors.bold}Crow Platformer - Asset Validation${colors.reset}`);
    console.log('='.repeat(60));

    if (!fs.existsSync(AUDIO_MANIFEST_PATH)) {
        console.error(`\n${colors.red}Missing audio manifest:${colors.reset} ${AUDIO_MANIFEST_PATH}`);
        process.exit(1);
    }

    // NOTE: a second copy of the optional-slot list used to sit here, filtering
    // absent slots out of the list entirely. It arrived from a different session
    // in the same week as OPTIONAL_ASSET_SLOTS above, which solves the same
    // problem — two lists of the same three paths in one file, and a file dropped
    // into one but not the other would behave differently depending on which
    // branch you read. Collapsed onto the single list at the top.
    //
    // Kept the ABSENT reporting rather than the filter, on one argument: 86 art
    // files are still to land, and a slot you can SEE is unfilled is worth more
    // than a slot that vanishes from the output. Both agree on the part that
    // matters — once a file is dropped in, it validates like any other asset.
    const bootVisuals = extractReferencedVisualAssets();
    const audioAssets = extractManifestAudioAssets();
    const compiledLevelAssets = extractCompiledLevelAssets();
    const referencedAssets = [
        ...audioAssets.sfx,
        ...audioAssets.music,
        ...bootVisuals,
        ...compiledLevelAssets,
    ];
    const uniqueReferencedAssets = [...new Set(referencedAssets)].sort();
    const missingAssets = [];

    console.log(`\n${colors.green}OK${colors.reset} audio_manifest.json loaded`);
    console.log(`${colors.green}OK${colors.reset} referenced asset paths extracted from godot sources`);
    console.log(`${colors.green}OK${colors.reset} compiled level tileset image paths extracted from JSON`);

    printGroup('Sound Effects', audioAssets.sfx, missingAssets);
    printGroup('Music Tracks', audioAssets.music, missingAssets);
    printGroup('Boot-Loaded Visual Assets', bootVisuals, missingAssets);
    printGroup('Compiled Level Tileset Assets', compiledLevelAssets, missingAssets);

    const suspiciousAssets = findSuspiciousUnreferencedAssets(uniqueReferencedAssets);

    console.log('\n' + '='.repeat(60));
    console.log(`${colors.bold}Summary${colors.reset}`);
    console.log('='.repeat(60));
    console.log(`Referenced live assets checked: ${uniqueReferencedAssets.length}`);
    console.log(`Suspicious unreferenced assets: ${suspiciousAssets.length}`);

    if (missingAssets.length > 0) {
        console.log(`\n${colors.red}Missing ${missingAssets.length} required asset(s):${colors.reset}`);
        for (const relativePath of missingAssets) {
            console.log(`- ${relativePath}`);
        }
    }

    if (suspiciousAssets.length > 0) {
        console.log(`\n${colors.yellow}Suspicious unreferenced assets still live under godot/assets:${colors.reset}`);
        for (const entry of suspiciousAssets) {
            console.log(`- ${entry.relativePath} (${entry.label})`);
        }
    }

    if (missingAssets.length > 0 || suspiciousAssets.length > 0) {
        process.exit(1);
    }

    const pendingSlots = [...OPTIONAL_ASSET_SLOTS].filter(p => !checkFile(p).exists);
    console.log(`\n${colors.green}All required assets are present, and no suspicious experimental leftovers remain in godot/assets.${colors.reset}`);
    if (pendingSlots.length > 0) {
        // Said out loud rather than passed over: a green gate that quietly hides
        // unfilled art slots is how they stay unfilled.
        console.log(`${pendingSlots.length} optional art slot(s) still awaiting art `
            + `(brand/ASSET_MANIFEST.md P1): ${pendingSlots.map(formatAssetLabel).join(', ')}`);
    }
    console.log('');
}

main();
