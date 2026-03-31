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
const BOOT_SCENE_PATH = path.join(ROOT, 'src', 'scenes', 'BootScene.ts');
const AUDIO_MANIFEST_PATH = path.join(ROOT, 'public', 'data', 'audio', 'audio_manifest.json');
const COMPILED_LEVELS_DIR = path.join(ROOT, 'public', 'data', 'levels', 'compiled');
const LIVE_ASSET_ROOT = path.join(ROOT, 'public', 'assets');

const SUSPICIOUS_UNREFERENCED_PATTERNS = [
    { pattern: /\.zip$/i, label: 'archive bundle' },
    { pattern: /Gemini_Generated/i, label: 'generated scratch image' },
    { pattern: /(^|[\\/])crownew/i, label: 'crow experiment export' },
    { pattern: /(^|[\\/])crow1(?:\.2|\.3)?\.png$/i, label: 'legacy crow root frame' },
    { pattern: /(^|[\\/])crow[234]\.png$/i, label: 'legacy crow root frame' },
    { pattern: /^public\/assets\/sprites\/characters\/crow2\/crow2\//i, label: 'archivable crow2 source folder' },
    { pattern: /^public\/assets\/sprites\/characters\/crow2\/crowjump\//i, label: 'archivable crowjump source folder' },
    { pattern: /^public\/assets\/sprites\/characters\/crow2\/crow3\/sprite-64px-9-frames\//i, label: 'archivable extracted frame folder' },
    { pattern: /(^|[\\/])sprite-256px-25\.png$/i, label: 'legacy extracted sprite sheet' },
    { pattern: /(^|[\\/])sprite-64px-9\.png$/i, label: 'legacy extracted sprite sheet' },
    { pattern: /(^|[\\/])coin\.png$/i, label: 'legacy coin experiment' },
    { pattern: /(^|[\\/])coins\.jpg$/i, label: 'legacy coin experiment' },
    { pattern: /(^|[\\/])coins2\.png$/i, label: 'legacy coin experiment' },
    { pattern: /(^|[\\/])door1\.png$/i, label: 'legacy door sprite' },
    { pattern: /(^|[\\/])door2\.png$/i, label: 'legacy door sprite' },
    { pattern: /^public\/assets\/tilesets\/level1\//i, label: 'archivable tileset source folder' },
    { pattern: /^public\/assets\/sprites\/levels\/level1\//i, label: 'archivable level art source folder' },
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

function normalizeToPublicPath(assetPath) {
    const normalized = toPosix(assetPath);
    if (normalized.startsWith('public/')) {
        return normalized;
    }
    const embeddedAssetsPath = normalized.match(/(?:^|\/)(assets\/.+)$/);
    if (embeddedAssetsPath) {
        return `public/${embeddedAssetsPath[1]}`;
    }
    if (normalized.startsWith('assets/')) {
        return `public/${normalized}`;
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
    return relativePath.replace(/^public\//, '');
}

function printGroup(title, entries, missing) {
    console.log(`\n${colors.cyan}${colors.bold}${title}${colors.reset}`);
    console.log('-'.repeat(60));

    for (const relativePath of entries) {
        const result = checkFile(relativePath);
        const label = formatAssetLabel(relativePath);
        if (result.exists) {
            console.log(`  ${colors.green}OK${colors.reset} ${label.padEnd(42)} (${formatSize(result.size)})`);
        } else {
            console.log(`  ${colors.red}MISS${colors.reset} ${label}`);
            missing.push(relativePath);
        }
    }
}

function extractBootVisualAssets() {
    const bootSource = readText(BOOT_SCENE_PATH);
    const matches = [
        ...bootSource.matchAll(/this\.load\.(?:image|spritesheet)\(\s*'[^']+'\s*,\s*'([^']+)'/g),
    ];

    return [...new Set(matches.map(match => normalizeToPublicPath(match[1])))].sort();
}

function extractManifestAudioAssets() {
    const audioManifest = loadJson(AUDIO_MANIFEST_PATH);
    const sfx = Object.values(audioManifest.sfx || {}).map(entry => normalizeToPublicPath(entry.file));
    const music = Object.values(audioManifest.music || {}).map(entry => normalizeToPublicPath(entry.file));

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
            const normalized = normalizeToPublicPath(tileset.image);
            if (normalized.startsWith('public/assets/')) {
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

    const bootVisuals = extractBootVisualAssets();
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
    console.log(`${colors.green}OK${colors.reset} BootScene asset paths extracted from source`);
    console.log(`${colors.green}OK${colors.reset} compiled level tileset image paths extracted from JSON`);

    printGroup('Sound Effects', audioAssets.sfx, missingAssets);
    printGroup('Music Tracks', audioAssets.music, missingAssets);
    printGroup('BootScene Visual Assets', bootVisuals, missingAssets);
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
        console.log(`\n${colors.yellow}Suspicious unreferenced assets still live under public/assets:${colors.reset}`);
        for (const entry of suspiciousAssets) {
            console.log(`- ${entry.relativePath} (${entry.label})`);
        }
    }

    if (missingAssets.length > 0 || suspiciousAssets.length > 0) {
        process.exit(1);
    }

    console.log(`\n${colors.green}All referenced live assets are present, and no suspicious experimental leftovers remain in public/assets.${colors.reset}\n`);
}

main();
