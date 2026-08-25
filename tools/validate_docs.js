const fs = require('fs');
const path = require('path');

/*
 * Doc validation.
 *
 * The rule this file now follows: ONLY check things that can be DERIVED from
 * code or data. The previous version was 587 lines, and roughly sixty of its
 * checks asserted that a particular English sentence appeared in a particular
 * markdown file. Those pinned prose, not truth — and they were no defence at
 * all against the thing that actually went wrong. The counts this file did not
 * compute are exactly the counts that drifted: the onboarding doc claimed 51
 * `.gd` scripts against a real 66, and 9 kernel sources against a real 12, and
 * nothing noticed for months.
 *
 * So: derive the number, then assert the doc says it. If a check cannot be
 * grounded in a file the build reads, it does not belong here.
 */

const root = process.cwd();
const errors = [];
const textCache = new Map();

const VALID_STATUSES = new Set(['Current', 'Supportive', 'Historical']);

const REQUIRED_DOC_STATUSES = {
    'README.md': 'Current',
    'ONBOARDING.md': 'Current',
    'ARCHITECTURE.md': 'Current',
    'PRODUCT.md': 'Current',
    'roadmap.md': 'Current',
    'CONTRIBUTING.md': 'Supportive',
    'PRIVACY.md': 'Supportive',
    'SECURITY.md': 'Supportive',
    'LICENSE_ATTRIBUTIONS.md': 'Supportive',
};

const STORAGE_KEYS = [
    'crow_profiles',
    'crow_active_user',
    'crow_family_id',
    'crow_save_<username>',
    'crow_save_v1',
    'crow_translations',
    'crow_learner_api_base',
    'crow_learner_snapshot_<childId>',
    'crow_learner_pending_attempts_<childId>',
];

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.godot']);

function fail(message) {
    errors.push(message);
}

function toPosix(relativePath) {
    return relativePath.split(path.sep).join('/');
}

function readText(relativePath) {
    if (!textCache.has(relativePath)) {
        textCache.set(relativePath, fs.readFileSync(path.join(root, relativePath), 'utf8'));
    }
    return textCache.get(relativePath);
}

function loadJson(relativePath) {
    return JSON.parse(readText(relativePath));
}

// `_comment` keys are documentation inside data files — the repo uses them
// widely and they are not entries. Counting them is how the sound-event number
// drifted.
function countObjectKeys(value) {
    if (!value) return 0;
    return Object.keys(value).filter(key => !key.startsWith('_')).length;
}

function formatInlineCodeList(values) {
    if (!values || values.length === 0) return '';
    if (values.length === 1) return `\`${values[0]}\``;
    if (values.length === 2) return `\`${values[0]}\` plus \`${values[1]}\``;
    const leading = values.slice(0, -1).map(value => `\`${value}\``).join(', ');
    return `${leading}, and \`${values[values.length - 1]}\``;
}

function walkFiles(relativeDirectory, allowedExtensions) {
    const absoluteDirectory = path.join(root, relativeDirectory);
    const files = [];

    for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
        const relativePath = toPosix(path.join(relativeDirectory, entry.name));
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            files.push(...walkFiles(relativePath, allowedExtensions));
            continue;
        }
        if (entry.isFile() && allowedExtensions.has(path.extname(entry.name).toLowerCase())) {
            files.push(relativePath);
        }
    }

    return files;
}

function ensureDocContains(relativePath, snippet, description) {
    if (!readText(relativePath).includes(snippet)) {
        fail(`${relativePath}: missing ${description}: "${snippet}"`);
    }
}

function ensureSourcePattern(relativePath, pattern, description) {
    if (!pattern.test(readText(relativePath))) {
        fail(`${relativePath}: missing runtime/source pattern for ${description}`);
    }
}

function ensureNoPattern(relativePath, pattern, description) {
    if (pattern.test(readText(relativePath))) {
        fail(`${relativePath}: contains ${description}`);
    }
}

/** Every doc carries Status / Authority / Last-verified metadata. */
function validateDocMetadata() {
    const markdownFiles = walkFiles('.', new Set(['.md']));
    const byStatus = { Current: [], Supportive: [], Historical: [] };

    for (const doc of markdownFiles) {
        const text = readText(doc);
        const status = text.match(/^Status:\s+(.+)$/m);
        const authority = text.match(/^Authority:\s+(.+)$/m);
        const verified = text.match(/^Last verified against code:\s+(\d{4}-\d{2}-\d{2})$/m);

        if (!status) fail(`${doc}: missing Status metadata`);
        else if (!VALID_STATUSES.has(status[1].trim())) fail(`${doc}: invalid Status "${status[1].trim()}"`);
        else byStatus[status[1].trim()].push(doc);

        if (!authority) fail(`${doc}: missing Authority metadata`);
        if (!verified) fail(`${doc}: missing or malformed Last verified metadata`);
    }

    const present = new Set(markdownFiles);
    for (const [doc, expected] of Object.entries(REQUIRED_DOC_STATUSES)) {
        if (!present.has(doc)) {
            fail(`${doc}: file is missing`);
            continue;
        }
        const actual = (readText(doc).match(/^Status:\s+(.+)$/m) || [, ''])[1].trim();
        if (actual !== expected) fail(`${doc}: expected Status ${expected} but found ${actual}`);
    }

    return byStatus;
}

/**
 * The canonical snapshot. Every number here is computed from the data, so a
 * content change forces the doc to follow in the same commit.
 */
function validateOnboardingSnapshot() {
    const DOC = 'ONBOARDING.md';

    const sceneCount = countObjectKeys(loadJson('godot/data/registries/scenes.json'));
    const easy = loadJson('godot/data/math/problems_easy.json').problems.length;
    const dataset = loadJson('godot/data/math/problems_dataset.json').problems.length;
    const gaps = loadJson('godot/data/math/problems_gaps.json').problems.length;
    const curriculum = loadJson('godot/data/math/problems_curriculum.json').problems.length;
    const totalProblems = easy + dataset + gaps + curriculum;
    const levelCount = loadJson('godot/data/levels/level_registry.json').levels.length;
    const npcCount = loadJson('godot/data/npcs/npc_registry.json').npcs.length;
    const enemyCount = loadJson('godot/data/enemies/enemy_registry.json').enemies.length;
    const audio = loadJson('godot/data/audio/audio_manifest.json');
    const musicCount = countObjectKeys(audio.music);
    const sfxCount = countObjectKeys(audio.sfx);
    const autoloadCount = (readText('godot/project.godot').match(/^[A-Za-z_][A-Za-z0-9_]*="\*res:\/\//gm) || []).length;
    const soundEventCount = countObjectKeys(loadJson('godot/data/audio/sound_events.json'));
    const spawnCount = countObjectKeys(loadJson('godot/data/registries/spawn_registry.json'));
    const stringKeyCount = countObjectKeys(loadJson('godot/data/i18n/strings_en.json'));
    const probeCount = (readText('godot/tools/run_tests.sh').match(/res:\/\/tests\/integration\/\w+\.tscn/g) || []).length;
    const migrationCount = fs.readdirSync(path.join(root, 'server/migrations')).filter(f => f.endsWith('.sql')).length;

    ensureDocContains('README.md', 'Mutable numeric repo counts live in one place only:', 'canonical snapshot rule');
    ensureDocContains(DOC, 'This is the only canonical numeric snapshot block in the current docs.', 'canonical snapshot block rule');

    ensureDocContains(DOC, `registers ${sceneCount} scenes`, 'scene count');
    ensureDocContains(DOC, `loads 4 math pools totaling ${totalProblems} problems`, 'math pool total');
    ensureDocContains(DOC, `- \`easy\`: ${easy}`, 'easy pool count');
    ensureDocContains(DOC, `- \`dataset\`: ${dataset}`, 'dataset pool count');
    ensureDocContains(DOC, `- \`gaps\`: ${gaps}`, 'gaps pool count');
    ensureDocContains(DOC, `- \`curriculum\`: ${curriculum}`, 'curriculum pool count');
    ensureDocContains(DOC, `contains ${levelCount} levels`, 'level count');
    ensureDocContains(DOC, `contains ${npcCount} NPC ${npcCount === 1 ? 'entry' : 'entries'}`, 'NPC count');
    ensureDocContains(DOC, `contains ${enemyCount} enemy type`, 'enemy count');
    ensureDocContains(DOC, sfxCount === 0
        ? `currently exposes ${musicCount} music tracks and no live SFX entries`
        : `currently exposes ${musicCount} music tracks and ${sfxCount} live SFX entries`, 'audio manifest');
    ensureDocContains(DOC, `**${autoloadCount}** autoloads`, 'autoload count');
    ensureDocContains(DOC, `**${soundEventCount}** semantic sound events`, 'sound event count');
    ensureDocContains(DOC, `**${spawnCount}** spawnable object types`, 'spawn type count');
    ensureDocContains(DOC, `**${stringKeyCount}** keys`, 'string key count');
    ensureDocContains(DOC, `**${probeCount}** headless physics probes`, 'probe count');
    ensureDocContains(DOC, `**${migrationCount}** migrations`, 'migration count');
    ensureDocContains('README.md', `${probeCount} physics probes`, 'readme probe count');

    // Counts belong in one file. Anywhere else they rot unnoticed.
    const duplicated = [
        { pattern: /\bregisters \d+ scenes\b/, description: 'scene counts' },
        { pattern: /\bloads \d+ math pools totaling \d+ problems\b/, description: 'math pool counts' },
        { pattern: /\bcontains \d+ levels\b/, description: 'level counts' },
        { pattern: /\bcontains \d+ NPC (?:entry|entries)\b/, description: 'NPC counts' },
        { pattern: /\bcontains \d+ enemy type\b/, description: 'enemy counts' },
        { pattern: /\b\d+ (?:music tracks|live SFX entries)\b/, description: 'audio manifest counts' },
    ];
    // EVERY doc except the canonical one, not a hardcoded list. A hardcoded list
    // was the first version of this and it leaked: a count landing in
    // CONTRIBUTING.md, PRIVACY.md, brand/README.md or deploy/RAILWAY.md sailed
    // through, which is exactly the drift this check exists to stop.
    for (const doc of walkFiles('.', new Set(['.md']))) {
        if (doc === DOC) continue;
        for (const { pattern, description } of duplicated) {
            ensureNoPattern(doc, pattern, `a duplicate mutable count for ${description} (these live in ${DOC})`);
        }
    }

    return { sceneCount, totalProblems, levelCount, npcCount, enemyCount, musicCount, sfxCount };
}

/**
 * Tier-1 constants, pinned in the source that owns them. These are the numbers
 * that decide how hard the game feels to a child; the parity fixtures hold the
 * two ports together, and these hold the ports to what ARCHITECTURE.md claims.
 */
function validateLearnerConstants() {
    const ARCH = 'ARCHITECTURE.md';
    const mathTuning = loadJson('godot/data/tuning/math_tuning.json');

    ensureSourcePattern('math-kernel/math/ELOManager.ts', /globalELO:\s*150/, 'starting global ELO');
    ensureSourcePattern('math-kernel/math/ELOManager.ts', /if\s*\(problemsAttempted\s*<\s*30\)\s*return\s+16;/, 'first K-factor band');
    ensureSourcePattern('math-kernel/math/ELOManager.ts', /if\s*\(problemsAttempted\s*<\s*150\)\s*return\s+12;/, 'second K-factor band');
    ensureSourcePattern('math-kernel/math/ELOManager.ts', /return\s+8;/, 'third K-factor band');
    ensureSourcePattern('math-kernel/systems/LearnerStateManager.ts', /clamp\(decayed\s*\+\s*delta,\s*-50,\s*20\)/, 'confidence clamp');
    ensureSourcePattern('math-kernel/systems/LearnerStateManager.ts', /progress\.winsAtCurrentStep\s*>=\s*ladder\(\)\.promotionWinTarget/, 'curriculum promotion gate');
    ensureSourcePattern('math-kernel/systems/LearnerStateManager.ts', /wrongCount\s*>=\s*ladder\(\)\.demotionWrongThreshold/, 'curriculum demotion gate');
    ensureSourcePattern('math-kernel/systems/LearnerStateManager.ts', /stage:\s*'immediate'/, 'immediate review stage');
    ensureSourcePattern('math-kernel/systems/LearnerStateManager.ts', /case\s+'day_7':/, 'day_7 review stage');
    ensureSourcePattern('math-kernel/math/selection/ELOAwareStrategy.ts', /mathTuning\(\)\.laneWeights/, 'lane weights read from shared tuning');
    ensureSourcePattern('math-kernel/math/selection/ELOAwareStrategy.ts', /canUseStretchLane\(domain\)/, 'stretch lane gate');
    ensureSourcePattern('godot/scripts/math/owl_selection.gd', /"maxOperand": config\.get\("maxOperand", 20\)/, 'local owl max-operand ceiling');
    ensureSourcePattern('godot/scripts/ui/math_challenge.gd', /var options: Array = answer\.get\("options", \[\]\)/, 'MCQ options drive the answer buttons');
    ensureSourcePattern('godot/scripts/scenes/login.gd', /func _finish_login\(\) -> void:/, 'login success rehydrate owner');
    ensureSourcePattern('godot/scripts/scenes/login.gd', /SaveManager\.switch_profile\(\)/, 'profile-switch on login');

    // The downward ratchet guard. Demotion must be evaluated only on the wrong
    // answer itself — evaluating it on every attempt is what let one miss cost
    // several steps as it slid through the window.
    ensureSourcePattern('math-kernel/systems/LearnerStateManager.ts', /if\s*\(!attempt\.correct\)\s*\{/, 'demotion evaluated on the miss only');

    // The other two halves of that guard are values, not source constants. A
    // miss lands confidence at exactly -15, so the threshold must stay clear of
    // it or one miss demotes again; and the floor must lift confidence back off
    // the gate so the next miss does not re-demote instantly.
    const ladder = mathTuning.ladder;
    if (ladder.demotionConfidenceThreshold >= -15) {
        fail(`math_tuning.json: ladder.demotionConfidenceThreshold is ${ladder.demotionConfidenceThreshold};`
            + ' a single miss sets confidence to exactly -15, so anything >= -15 demotes on one miss');
    }
    if (ladder.postDemotionConfidenceFloor <= ladder.demotionConfidenceThreshold) {
        fail(`math_tuning.json: ladder.postDemotionConfidenceFloor (${ladder.postDemotionConfidenceFloor})`
            + ` must sit above ladder.demotionConfidenceThreshold (${ladder.demotionConfidenceThreshold}),`
            + ' or demotion leaves confidence on the gate and the next miss re-demotes');
    }

    // Lane weights are derived from the tuning file, so retuning forces the doc.
    const weights = mathTuning.laneWeights;
    ensureDocContains(ARCH, `\`${Math.round(weights.comfort * 100)}%\` comfort`, 'comfort lane weight');
    ensureDocContains(ARCH, `\`${Math.round(weights.review * 100)}%\` review`, 'review lane weight');
    ensureDocContains(ARCH, `\`${Math.round(weights.at_level * 100)}%\` at level`, 'at-level lane weight');
    ensureDocContains(ARCH, `\`${Math.round(weights.stretch * 100)}%\` stretch`, 'stretch lane weight');
}

/** The storage contract, pinned where it is declared. */
function validateStorageContracts() {
    const PM = 'godot/scripts/autoload/profile_manager.gd';
    const LSS = 'godot/scripts/systems/learner_sync_service.gd';

    ensureSourcePattern(PM, /const PROFILES_KEY := "crow_profiles"/, 'profiles key');
    ensureSourcePattern(PM, /const ACTIVE_KEY := "crow_active_user"/, 'active user key');
    ensureSourcePattern(PM, /const FAMILY_KEY := "crow_family_id"/, 'family id key');
    ensureSourcePattern(PM, /return "crow_save_%s" % username/, 'profile save key template');
    ensureSourcePattern(PM, /const LEGACY_SAVE_KEY := "crow_save_v1"/, 'legacy save fallback key');
    ensureSourcePattern('godot/scripts/autoload/text_manager.gd', /const STORAGE_KEY := "crow_translations"/, 'translation storage key');
    ensureSourcePattern(LSS, /const API_BASE_KEY := "crow_learner_api_base"/, 'learner API base key');
    ensureSourcePattern(LSS, /return "crow_learner_snapshot_%s" % child_id/, 'learner snapshot key template');
    ensureSourcePattern(LSS, /return "crow_learner_pending_attempts_%s" % child_id/, 'pending attempts key template');
    ensureSourcePattern(LSS, /normalized\["childId"\] = profile\["childId"\]/, 'active profile childId normalization');
    ensureSourcePattern(LSS, /normalized\["familyId"\] = profile\["familyId"\]/, 'active profile familyId normalization');
    ensureSourcePattern(LSS, /LearnerStateManager\.replace_snapshot\(snapshot\)/, 'remote snapshot replacement');
    ensureSourcePattern(LSS, /LearnerStateManager\.replace_snapshot\(synced\)/, 'remote sync snapshot replacement');

    // Every key the runtime uses must be documented, or a debugger cannot find it.
    for (const key of STORAGE_KEYS) {
        ensureDocContains('ARCHITECTURE.md', `\`${key}\``, `storage key ${key}`);
    }
}

/** The owl reports must agree with the NPC config they describe. */
function validateMathAuthoringReports() {
    const owlSurface = loadJson('reports/math-batches/owl-surface-summary.json');
    const selectorSmoke = loadJson('reports/math-batches/runtime-selector-smoke.json');
    const reviewSummary = loadJson('reports/math-batches/review-summary.json');
    const npcRegistry = loadJson('godot/data/npcs/npc_registry.json');

    const owl = npcRegistry.npcs?.find(npc => npc.id === 'owl_teacher_01') ?? npcRegistry.npcs?.[0];
    const mathComponent = owl?.components?.find(component => component.type === 'math_challenge');
    const problemCount = Number(mathComponent?.problemCount ?? 1);

    if (owlSurface.currentInteractionProblemCount !== problemCount) {
        fail(`owl-surface-summary.json: currentInteractionProblemCount ${owlSurface.currentInteractionProblemCount} does not match owl NPC problemCount ${problemCount}`);
    }
    if (selectorSmoke.metrics.interactionProblemCount !== problemCount) {
        fail(`runtime-selector-smoke.json: interactionProblemCount ${selectorSmoke.metrics.interactionProblemCount} does not match owl NPC problemCount ${problemCount}`);
    }
    const acceptedRows = reviewSummary.batchReviews.filter(review => review.accepted).length;
    if (reviewSummary.acceptedBatchCount !== acceptedRows) {
        fail(`review-summary.json: acceptedBatchCount ${reviewSummary.acceptedBatchCount} does not match accepted batch rows ${acceptedRows}`);
    }
    if (owlSurface.freshReachableProblemCount > owlSurface.openingUnlockedInventoryProblemCount) {
        fail('owl-surface-summary.json: freshReachableProblemCount cannot exceed openingUnlockedInventoryProblemCount');
    }

    // The owl-path boundary is the claim people get wrong, so it is derived.
    const openingDomains = formatInlineCodeList(owlSurface.openingUnlockedDomains);
    ensureDocContains('ONBOARDING.md', `The opening unlocked domains are ${openingDomains}`, 'fresh owl opening domains');
    ensureDocContains('ONBOARDING.md',
        `Shipped owl interaction length is \`${problemCount}\` problem${problemCount === 1 ? '' : 's'} per encounter`,
        'owl encounter length');
}

/** Live code must not point at trees that are not runtime. */
function validateLiveSourceReferences() {
    // The retired-Phaser names are banned outright now that the sweep has landed.
    // They cannot come back without failing the build, which is the point: every
    // one of them was a comment explaining live code against a tree that had been
    // deleted, and a reader has no way to tell such a comment from a true one.
    const banned = [
        { pattern: /\barchived[\\/]/i, label: 'archived/** (deleted)' },
        { pattern: /\bai_assets[\\/]/i, label: 'ai_assets/** (staging, not runtime)' },
        { pattern: /\bpublic[\\/]assets[\\/]/i, label: 'public/assets/** (retired Phaser tree)' },
        { pattern: /\bBootScene\b/, label: 'BootScene (retired Phaser tree)' },
        { pattern: /\bsrc[\\/](?:math|systems|scenes|ui|entities|utils)[\\/]/i, label: 'src/** (retired Phaser tree)' },
        { pattern: /\bdocs[\\/]API_CONTRACT\.md\b/, label: 'docs/API_CONTRACT.md (now a section of ARCHITECTURE.md)' },
    ];

    const liveFiles = [
        ...walkFiles('godot/scripts', new Set(['.gd'])),
        ...walkFiles('godot/data', new Set(['.json'])),
        ...walkFiles('math-kernel', new Set(['.ts'])),
    ];

    for (const file of liveFiles) {
        for (const { pattern, label } of banned) {
            if (pattern.test(readText(file))) {
                fail(`${file}: contains a reference to ${label}`);
            }
        }
    }
}

/**
 * roadmap.md lists open work only. Finished items must be deleted, not ticked
 * off, so this fails on the markers people reach for instead of deleting.
 */
function validateRoadmapHasNoCompletedItems() {
    const relativePath = 'roadmap.md';
    if (!fs.existsSync(path.join(root, relativePath))) return;
    const text = readText(relativePath);

    // Scan entries only: the rules block quotes the markers it forbids, and the
    // Settled section is explicitly allowed to describe closed decisions.
    const firstEntry = text.search(/\n## (?!READ THIS FIRST)/);
    const settledIndex = text.indexOf('## Settled');
    const start = firstEntry === -1 ? 0 : firstEntry;
    const end = settledIndex === -1 ? text.length : settledIndex;
    const openWork = start < end ? text.slice(start, end) : '';
    const afterRules = start < text.length ? text.slice(start) : '';

    const banned = [
        { pattern: /^\s*[-*]\s*\[[xX]\]/m, why: 'a ticked checkbox', scope: afterRules },
        { pattern: /~~/, why: 'strikethrough', scope: afterRules },
        { pattern: /✅|✔/, why: 'a check-mark character', scope: afterRules },
        { pattern: /^\s*#+\s*(?:done|completed|shipped|finished)\b/im, why: 'a completed-work heading', scope: afterRules },
        { pattern: /\((?:done|DONE|Done|completed|COMPLETED|shipped|SHIPPED)\)/, why: 'a "(done)" style annotation', scope: openWork },
    ];

    for (const { pattern, why, scope } of banned) {
        const match = scope.match(pattern);
        if (match) {
            fail(
                `${relativePath}: contains ${why} (${JSON.stringify(match[0].trim())}). ` +
                'Finished items must be DELETED from the roadmap, not marked complete. ' +
                'Record what you did in the commit message instead.',
            );
        }
    }

    for (const heading of ['## READ THIS FIRST', 'DELETE IT']) {
        if (!text.includes(heading)) {
            fail(`${relativePath}: the enforcement notice is missing ("${heading}"). Do not remove the rules block.`);
        }
    }
}

function main() {
    console.log('Validating documentation...');

    const byStatus = validateDocMetadata();
    const snapshot = validateOnboardingSnapshot();
    validateLearnerConstants();
    validateStorageContracts();
    validateMathAuthoringReports();
    validateLiveSourceReferences();
    validateRoadmapHasNoCompletedItems();

    if (errors.length > 0) {
        console.error('\nDocumentation validation failed:');
        for (const error of errors) console.error(`- ${error}`);
        process.exit(1);
    }

    console.log('Documentation is internally consistent.');
    console.log(
        `Verified snapshot: ${snapshot.sceneCount} scenes, ${snapshot.totalProblems} problems, `
        + `${snapshot.levelCount} levels, ${snapshot.npcCount} NPCs, ${snapshot.enemyCount} enemy type, `
        + `${snapshot.musicCount} music, ${snapshot.sfxCount} SFX.`,
    );
    console.log(
        `Docs by metadata: ${byStatus.Current.length} Current, ${byStatus.Supportive.length} Supportive, `
        + `${byStatus.Historical.length} Historical.`,
    );
}

main();
