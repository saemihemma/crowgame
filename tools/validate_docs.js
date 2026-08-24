const fs = require('fs');
const path = require('path');

const root = process.cwd();
const errors = [];
const textCache = new Map();

const VALID_STATUSES = new Set(['Current', 'Supportive', 'Historical']);
const REQUIRED_DOC_STATUSES = {
    'README.md': 'Current',
    'ONBOARDING_AGENT.md': 'Current',
    'MATH_SYSTEM_ARCHITECTURE.md': 'Current',
    'DEVELOPMENT_GUIDE.md': 'Current',
    'docs/MATH_AUTHORING_PIPELINE.md': 'Current',
    'docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md': 'Current',
    'PROJECT.md': 'Supportive',
    'AGENT_CONTEXT.md': 'Supportive',
    'ASSET_SPECS.md': 'Supportive',
    'ai_generation_guide.md': 'Supportive',
    'ai_assets/_readme.md': 'Supportive',
    'LICENSE_ATTRIBUTIONS.md': 'Supportive',
    'archived/README.md': 'Historical',
    'archived/docs/elo-math-system-plan.md': 'Historical',
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

function countObjectKeys(value) {
    return value ? Object.keys(value).length : 0;
}

function formatInlineCodeList(values) {
    if (!values || values.length === 0) {
        return '';
    }

    if (values.length === 1) {
        return `\`${values[0]}\``;
    }

    if (values.length === 2) {
        return `\`${values[0]}\` plus \`${values[1]}\``;
    }

    const leading = values.slice(0, -1).map(value => `\`${value}\``).join(', ');
    return `${leading}, and \`${values[values.length - 1]}\``;
}

/** Vendored, generated and archived trees are never documentation we own. */
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.godot']);

function walkMarkdownFiles(directoryRelativePath) {
    const absoluteDirectory = path.join(root, directoryRelativePath);
    const results = [];

    for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
        const relativePath = toPosix(path.join(directoryRelativePath, entry.name));
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) {
                continue;
            }
            results.push(...walkMarkdownFiles(relativePath));
            continue;
        }

        if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
            results.push(relativePath);
        }
    }

    return results.sort();
}

function walkTextFiles(relativeDirectory, allowedExtensions) {
    const absoluteDirectory = path.join(root, relativeDirectory);
    const files = [];

    for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
        const relativePath = toPosix(path.join(relativeDirectory, entry.name));
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            files.push(...walkTextFiles(relativePath, allowedExtensions));
            continue;
        }

        if (entry.isFile() && allowedExtensions.has(path.extname(entry.name).toLowerCase())) {
            files.push(relativePath);
        }
    }

    return files;
}

function parseMetadata(relativePath) {
    const text = readText(relativePath);
    const statusMatch = text.match(/^Status:\s+(.+)$/m);
    const authorityMatch = text.match(/^Authority:\s+(.+)$/m);
    const verifiedMatch = text.match(/^Last verified against code:\s+(\d{4}-\d{2}-\d{2})$/m);

    if (!statusMatch) {
        fail(`${relativePath}: missing Status metadata`);
    } else if (!VALID_STATUSES.has(statusMatch[1].trim())) {
        fail(`${relativePath}: invalid Status metadata "${statusMatch[1].trim()}"`);
    }

    if (!authorityMatch) {
        fail(`${relativePath}: missing Authority metadata`);
    }

    if (!verifiedMatch) {
        fail(`${relativePath}: missing or malformed Last verified metadata`);
    }

    return {
        status: statusMatch ? statusMatch[1].trim() : '',
        authority: authorityMatch ? authorityMatch[1].trim() : '',
        verifiedAt: verifiedMatch ? verifiedMatch[1] : '',
    };
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
        fail(`${relativePath}: contains duplicate mutable snapshot content for ${description}`);
    }
}

function ensureNoLiveReference(relativePath, pattern, description) {
    if (pattern.test(readText(relativePath))) {
        fail(`${relativePath}: contains forbidden live reference to ${description}`);
    }
}

function buildDocsByStatus(markdownFiles) {
    const docsByStatus = {
        Current: [],
        Supportive: [],
        Historical: [],
    };

    for (const doc of markdownFiles) {
        const metadata = parseMetadata(doc);
        if (metadata.status && docsByStatus[metadata.status]) {
            docsByStatus[metadata.status].push(doc);
        }
    }

    for (const docs of Object.values(docsByStatus)) {
        docs.sort();
    }

    return docsByStatus;
}

function extractSceneCount() {
    // The shipped game is the Godot build, so the scene count comes from the
    // Godot scene registry (the routing source of truth per godot/ARCHITECTURE.md
    // rule 4) rather than from the retired Phaser `scene: [...]` array.
    const registry = loadJson('godot/data/registries/scenes.json');
    return Object.keys(registry).filter(key => !key.startsWith('_')).length;
}

function validateRequiredDocStatuses(markdownFiles) {
    const docSet = new Set(markdownFiles);

    for (const [doc, expectedStatus] of Object.entries(REQUIRED_DOC_STATUSES)) {
        if (!docSet.has(doc)) {
            fail(`${doc}: file is missing`);
            continue;
        }

        const actualStatus = parseMetadata(doc).status;
        if (actualStatus !== expectedStatus) {
            fail(`${doc}: expected Status ${expectedStatus} but found ${actualStatus}`);
        }
    }

    for (const doc of markdownFiles) {
        const metadata = parseMetadata(doc);
        if (doc.startsWith('archived/') && metadata.status !== 'Historical') {
            fail(`${doc}: archived docs must use Status Historical`);
        }
    }
}

function validateOnboardingSnapshot(currentDocs) {
    const onboarding = readText('ONBOARDING_AGENT.md');
    const sceneCount = extractSceneCount();
    const easyCount = loadJson('godot/data/math/problems_easy.json').problems.length;
    const datasetCount = loadJson('godot/data/math/problems_dataset.json').problems.length;
    const gapsCount = loadJson('godot/data/math/problems_gaps.json').problems.length;
    const curriculumCount = loadJson('godot/data/math/problems_curriculum.json').problems.length;
    const totalProblems = easyCount + datasetCount + gapsCount + curriculumCount;
    const levelCount = loadJson('godot/data/levels/level_registry.json').levels.length;
    const npcCount = loadJson('godot/data/npcs/npc_registry.json').npcs.length;
    const enemyCount = loadJson('godot/data/enemies/enemy_registry.json').enemies.length;
    const audioManifest = loadJson('godot/data/audio/audio_manifest.json');
    const musicCount = countObjectKeys(audioManifest.music);
    const sfxCount = countObjectKeys(audioManifest.sfx);

    ensureDocContains('README.md', 'Mutable numeric repo counts live in one place only:', 'canonical snapshot rule');
    ensureDocContains('ONBOARDING_AGENT.md', 'This is the only canonical numeric snapshot block in the current docs.', 'canonical snapshot block rule');
    ensureDocContains('ONBOARDING_AGENT.md', `registers ${sceneCount} scenes`, 'scene count snapshot');
    ensureDocContains('ONBOARDING_AGENT.md', `loads 4 math pools totaling ${totalProblems} problems`, 'math pool snapshot');
    ensureDocContains('ONBOARDING_AGENT.md', `- \`easy\`: ${easyCount}`, 'easy pool count');
    ensureDocContains('ONBOARDING_AGENT.md', `- \`dataset\`: ${datasetCount}`, 'dataset pool count');
    ensureDocContains('ONBOARDING_AGENT.md', `- \`gaps\`: ${gapsCount}`, 'gaps pool count');
    ensureDocContains('ONBOARDING_AGENT.md', `- \`curriculum\`: ${curriculumCount}`, 'curriculum pool count');
    ensureDocContains('ONBOARDING_AGENT.md', `contains ${levelCount} levels`, 'level count snapshot');
    ensureDocContains('ONBOARDING_AGENT.md', `contains ${npcCount} NPC entry`, 'NPC count snapshot');
    ensureDocContains('ONBOARDING_AGENT.md', `contains ${enemyCount} enemy type`, 'enemy count snapshot');

    const audioSnapshot = sfxCount === 0
        ? `currently exposes ${musicCount} music tracks and no live SFX entries`
        : `currently exposes ${musicCount} music tracks and ${sfxCount} live SFX entries`;
    ensureDocContains('ONBOARDING_AGENT.md', audioSnapshot, 'audio manifest snapshot');

    const forbiddenPatterns = [
        { pattern: /\bregisters \d+ scenes\b/, description: 'scene counts' },
        { pattern: /\bloads \d+ math pools totaling \d+ problems\b/, description: 'math pool counts' },
        { pattern: /\bcontains \d+ levels\b/, description: 'level counts' },
        { pattern: /\bcontains \d+ NPC entry\b/, description: 'NPC counts' },
        { pattern: /\bcontains \d+ enemy type\b/, description: 'enemy counts' },
        { pattern: /\b\d+ music tracks\b/, description: 'audio manifest counts' },
        { pattern: /\b\d+ live SFX entries\b/, description: 'audio manifest counts' },
        { pattern: /\bno live SFX entries\b/, description: 'audio manifest counts' },
    ];

    for (const doc of currentDocs.filter(doc => doc !== 'ONBOARDING_AGENT.md')) {
        for (const entry of forbiddenPatterns) {
            ensureNoPattern(doc, entry.pattern, entry.description);
        }
    }

    return { sceneCount, totalProblems, levelCount, npcCount, enemyCount, musicCount, sfxCount };
}

function validateMathAndLearnerContracts() {
    ensureSourcePattern('math-kernel/math/ELOManager.ts', /globalELO:\s*150/, 'starting global ELO');
    ensureSourcePattern('math-kernel/math/ELOManager.ts', /if\s*\(problemsAttempted\s*<\s*50\)\s*return\s+4;/, 'first K-factor band');
    ensureSourcePattern('math-kernel/math/ELOManager.ts', /if\s*\(problemsAttempted\s*<\s*200\)\s*return\s+3;/, 'second K-factor band');
    ensureSourcePattern('math-kernel/math/ELOManager.ts', /return\s+2;/, 'third K-factor band');
    ensureSourcePattern('math-kernel/systems/LearnerStateManager.ts', /clamp\(decayed\s*\+\s*delta,\s*-50,\s*20\)/, 'confidence clamp');
    ensureSourcePattern('math-kernel/systems/LearnerStateManager.ts', /progress\.winsAtCurrentStep\s*>=\s*PROMOTION_WIN_TARGET/, 'curriculum promotion gate');
    ensureSourcePattern('math-kernel/systems/LearnerStateManager.ts', /wrongCount\s*>=\s*DEMOTION_WRONG_THRESHOLD/, 'curriculum demotion gate');
    ensureSourcePattern('math-kernel/systems/LearnerStateManager.ts', /stage:\s*'immediate'/, 'immediate review stage');
    ensureSourcePattern('math-kernel/systems/LearnerStateManager.ts', /case\s+'day_7':/, 'day_7 review stage');
    ensureSourcePattern('math-kernel/math/selection/ELOAwareStrategy.ts', /comfort:\s*0\.5/, 'comfort lane weight');
    ensureSourcePattern('math-kernel/math/selection/ELOAwareStrategy.ts', /review:\s*laneCandidates\.review\.length\s*>\s*0\s*\?\s*0\.25\s*:\s*0/, 'review lane weight');
    ensureSourcePattern('math-kernel/math/selection/ELOAwareStrategy.ts', /at_level:\s*0\.25/, 'at-level lane weight');
    ensureSourcePattern('math-kernel/math/selection/ELOAwareStrategy.ts', /stretch:\s*0/, 'stretch lane removal');
    ensureSourcePattern('godot/scripts/ui/math_challenge.gd', /var options: Array = answer\.get\("options", \[\]\)/, 'MCQ options drive the answer buttons');
    ensureSourcePattern('godot/scripts/scenes/login.gd', /func _finish_login\(\) -> void:/, 'login success rehydrate owner');
    ensureSourcePattern('godot/scripts/scenes/login.gd', /SaveManager\.switch_profile\(\)/, 'profile-switch on login');
    ensureSourcePattern('godot/scripts/math/owl_selection.gd', /"maxOperand": config\.get\("maxOperand", 20\)/, 'local owl max-operand ceiling');

    ensureDocContains('MATH_SYSTEM_ARCHITECTURE.md', 'default starting global ELO: `150`', 'starting ELO contract');
    ensureDocContains('MATH_SYSTEM_ARCHITECTURE.md', '- `4` before 50 attempts', 'K-factor first band');
    ensureDocContains('MATH_SYSTEM_ARCHITECTURE.md', '- `3` before 200 attempts', 'K-factor second band');
    ensureDocContains('MATH_SYSTEM_ARCHITECTURE.md', '- `2` afterward', 'K-factor third band');
    ensureDocContains('MATH_SYSTEM_ARCHITECTURE.md', 'currentStep', 'curriculum step ownership');
    ensureDocContains('MATH_SYSTEM_ARCHITECTURE.md', 'winsAtCurrentStep', 'curriculum progress ownership');
    ensureDocContains('MATH_SYSTEM_ARCHITECTURE.md', '- clamped to `-50..20`', 'confidence clamp');
    ensureDocContains('MATH_SYSTEM_ARCHITECTURE.md', '- `+4` for first-try correct', 'confidence first-try delta');
    ensureDocContains('MATH_SYSTEM_ARCHITECTURE.md', '- `+1` for corrected retry', 'confidence corrected-retry delta');
    ensureDocContains('MATH_SYSTEM_ARCHITECTURE.md', '- `-15` for wrong', 'confidence wrong delta');
    ensureDocContains('MATH_SYSTEM_ARCHITECTURE.md', '- `immediate`', 'review stage immediate');
    ensureDocContains('MATH_SYSTEM_ARCHITECTURE.md', '- `day_1`', 'review stage day_1');
    ensureDocContains('MATH_SYSTEM_ARCHITECTURE.md', '- `day_3`', 'review stage day_3');
    ensureDocContains('MATH_SYSTEM_ARCHITECTURE.md', '- `day_7`', 'review stage day_7');
    ensureDocContains('MATH_SYSTEM_ARCHITECTURE.md', '- `graduated`', 'review stage graduated');
    ensureDocContains('MATH_SYSTEM_ARCHITECTURE.md', '- `50%` comfort', 'comfort lane weight');
    ensureDocContains('MATH_SYSTEM_ARCHITECTURE.md', '- `25%` review', 'review lane weight');
    ensureDocContains('MATH_SYSTEM_ARCHITECTURE.md', '- `25%` at level', 'at-level lane weight');
    ensureDocContains('MATH_SYSTEM_ARCHITECTURE.md', '- `0%` harder', 'harder lane removal');
    ensureDocContains('MATH_SYSTEM_ARCHITECTURE.md', 'one curriculum step easier', 'comfort lane range');
    ensureDocContains('MATH_SYSTEM_ARCHITECTURE.md', 'exact current curriculum step', 'at-level lane range');
    ensureDocContains('MATH_SYSTEM_ARCHITECTURE.md', 'strategy steps down only', 'step-down-only fallback');
    ensureDocContains('MATH_SYSTEM_ARCHITECTURE.md', 'MCQ only', 'live answer-mode note');
    ensureDocContains('MATH_SYSTEM_ARCHITECTURE.md', 'up to four visible domain rows per child', 'accurate admin summary wording');
    ensureDocContains('MATH_SYSTEM_ARCHITECTURE.md', 'failed challenges', 'failed-challenge review wording');
    ensureDocContains('MATH_SYSTEM_ARCHITECTURE.md', 'runtime-aligned selector evidence', 'runtime smoke evidence boundary');
    ensureDocContains('ONBOARDING_AGENT.md', 'Math UI is currently MCQ-only', 'onboarding answer-mode snapshot');
    ensureDocContains('ONBOARDING_AGENT.md', 'currentStep', 'onboarding curriculum-step note');
    ensureDocContains('ONBOARDING_AGENT.md', 'runtime-aligned owl selector smoke', 'onboarding smoke wording');
    ensureDocContains('ONBOARDING_AGENT.md', 'selection-layer evidence built from the shared owl helper plus live learner-state and NPC config', 'onboarding smoke boundary');
    ensureDocContains('docs/MATH_AUTHORING_PIPELINE.md', 'runtime-aligned owl selector smoke', 'pipeline smoke wording');
    ensureDocContains('docs/MATH_AUTHORING_PIPELINE.md', 'shared owl-selection helper plus live learner-state and NPC-config rails', 'pipeline smoke implementation note');
    ensureDocContains('docs/MATH_AUTHORING_PIPELINE.md', 'not the literal browser scene/input/retry flow', 'pipeline smoke scope boundary');
    ensureNoPattern('ONBOARDING_AGENT.md', /live owl-path selector smoke/i, 'stale owl smoke wording');
    ensureNoPattern('docs/MATH_AUTHORING_PIPELINE.md', /live owl-path selector smoke/i, 'stale owl smoke wording');
    ensureNoPattern('docs/MATH_AUTHORING_PIPELINE.md', /actual local runtime selector/i, 'overstated owl smoke wording');
}

function validateStorageContracts() {
    // These assert the SHIPPED game's storage contract. The keys are identical to
    // the ones the retired Phaser build used — that was the porting requirement —
    // but the file that owns them is now GDScript, so the patterns are GDScript.
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

    for (const key of STORAGE_KEYS) {
        ensureDocContains('docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md', `- \`${key}\``, `learner-storage key ${key}`);
        ensureDocContains('ONBOARDING_AGENT.md', `- \`${key}\``, `onboarding state-reset key ${key}`);
    }

    ensureDocContains('docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md', '`LoginScene.loginSuccess()` owns the normal profile-switch rehydrate path', 'profile-switch owner note');
    ensureDocContains('docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md', '`BootScene` mirrors that same rehydrate sequence only on cold start', 'cold-start mirror note');
    ensureDocContains('docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md', 'active profile identity always wins over any saved or remote child identity', 'identity precedence rule');
    ensureDocContains('docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md', 'live mastery from `ELOManager` wins over stale mastery embedded in an older learner snapshot during initialization', 'mastery precedence rule');
    ensureDocContains('docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md', 'cached local snapshot is the fallback when remote fetch fails', 'cached snapshot fallback');
    ensureDocContains('docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md', 'remote fetch and sync success update in-memory learner state and the cached child snapshot', 'remote refresh note');
    ensureDocContains('docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md', 'they do not immediately rewrite the embedded `learnerState` copy inside `crow_save_<username>`', 'save-vs-cache distinction');
}

function validateDocWordingAndTaxonomy() {
    ensureDocContains('DEVELOPMENT_GUIDE.md', '- [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md)', 'self-listed current doc');
    ensureDocContains('ASSET_SPECS.md', 'Boot-time asset loading in [godot/scripts/autoload/data_manager.gd](./godot/scripts/autoload/data_manager.gd) currently expects:', 'asset contract lead-in');
    ensureDocContains('ASSET_SPECS.md', 'suspicious unreferenced leftovers that should be archived instead of staying live', 'asset validation cleanup scope note');
    ensureDocContains('archived/README.md', 'level-copy-legacy', 'clear archive folder naming');
    ensureDocContains('archived/README.md', 'scratch-images', 'clear archive scratch-image naming');
    ensureDocContains('archived/README.md', 'npcs-copy-legacy', 'clear archive NPC copy naming');
    ensureDocContains('archived/README.md', 'crow2-experiments', 'clear archive crow experiment naming');
    ensureDocContains('archived/README.md', 'coin-experiments', 'clear archive coin experiment naming');
    ensureDocContains('archived/README.md', 'door-legacy', 'clear archive door naming');
    ensureDocContains('archived/README.md', 'archived/tools/**', 'clear archived tools naming');
    ensureDocContains('archived/README.md', 'level1-source', 'clear archived level1 source naming');
}

function validateLiveSourceReferences() {
    const bannedPathPatterns = [
        { pattern: /\barchived[\\/]/i, label: 'archived/**' },
        { pattern: /\bai_assets[\\/]/i, label: 'ai_assets/**' },
    ];

    const liveSourceFiles = [
        ...walkTextFiles('godot/scripts', new Set(['.gd'])),
        ...walkTextFiles('godot/data', new Set(['.json'])),
        ...walkTextFiles('math-kernel', new Set(['.ts'])),
    ];

    for (const file of liveSourceFiles) {
        for (const entry of bannedPathPatterns) {
            ensureNoLiveReference(file, entry.pattern, entry.label);
        }
    }
}

function validateMathAuthoringReportContracts() {
    const owlSurface = loadJson('reports/math-batches/owl-surface-summary.json');
    const runtimeSelectorSmoke = loadJson('reports/math-batches/runtime-selector-smoke.json');
    const reviewSummary = loadJson('reports/math-batches/review-summary.json');
    const npcRegistry = loadJson('godot/data/npcs/npc_registry.json');
    const owlDefinition = npcRegistry.npcs?.find(npc => npc.id === 'owl_teacher_01') ?? npcRegistry.npcs?.[0];
    const mathComponent = owlDefinition?.components?.find(component => component.type === 'math_challenge');
    const configuredProblemCount = Number(mathComponent?.problemCount ?? 1);
    const formattedOpeningDomains = formatInlineCodeList(owlSurface.openingUnlockedDomains);

    if (owlSurface.currentInteractionProblemCount !== configuredProblemCount) {
        fail(`reports/math-batches/owl-surface-summary.json: currentInteractionProblemCount ${owlSurface.currentInteractionProblemCount} does not match owl NPC problemCount ${configuredProblemCount}`);
    }

    if (runtimeSelectorSmoke.metrics.interactionProblemCount !== configuredProblemCount) {
        fail(`reports/math-batches/runtime-selector-smoke.json: interactionProblemCount ${runtimeSelectorSmoke.metrics.interactionProblemCount} does not match owl NPC problemCount ${configuredProblemCount}`);
    }

    const acceptedRows = reviewSummary.batchReviews.filter(review => review.accepted).length;
    if (reviewSummary.acceptedBatchCount !== acceptedRows) {
        fail(`reports/math-batches/review-summary.json: acceptedBatchCount ${reviewSummary.acceptedBatchCount} does not match accepted batch rows ${acceptedRows}`);
    }

    if (owlSurface.freshReachableProblemCount > owlSurface.openingUnlockedInventoryProblemCount) {
        fail('reports/math-batches/owl-surface-summary.json: freshReachableProblemCount cannot exceed openingUnlockedInventoryProblemCount');
    }

    ensureDocContains('README.md', `fresh opening owl path currently starts with ${formattedOpeningDomains}`, 'fresh owl opening-domain boundary');
    ensureDocContains('ONBOARDING_AGENT.md', `opening unlocked domains currently ${formattedOpeningDomains}`, 'fresh owl opening-domain boundary');
    ensureDocContains('ONBOARDING_AGENT.md', `Current shipped owl interaction length is \`${configuredProblemCount}\` problems per owl encounter`, 'owl encounter-length boundary');
    ensureDocContains('docs/MATH_AUTHORING_PIPELINE.md', '`openingUnlockedInventory*` is the unlocked-domain inventory before current-step clamping.', 'owl report inventory semantics');
    ensureDocContains('docs/MATH_AUTHORING_PIPELINE.md', '`freshReachable*` is the real fresh-profile day-one reachable subset after current-step clamping.', 'owl report fresh-reachable semantics');
    ensureDocContains('MATH_SYSTEM_ARCHITECTURE.md', '`openingUnlockedInventory*` in that report means unlocked-domain inventory before current-step clamping.', 'math architecture inventory semantics');
    ensureDocContains('MATH_SYSTEM_ARCHITECTURE.md', '`freshReachable*` in that report means the real fresh-profile day-one reachable subset after current-step clamping.', 'math architecture fresh-reachable semantics');

    const currentDocs = ['README.md', 'ONBOARDING_AGENT.md', 'MATH_SYSTEM_ARCHITECTURE.md', 'docs/MATH_AUTHORING_PIPELINE.md'];
    for (const doc of currentDocs) {
        ensureNoPattern(doc, /pattern matching from the start/i, 'stale pattern-matching opening claim');
    }
}

function main() {
    console.log('Validating documentation...');

    const markdownFiles = walkMarkdownFiles('.');
    const docsByStatus = buildDocsByStatus(markdownFiles);
    validateRequiredDocStatuses(markdownFiles);
    const snapshot = validateOnboardingSnapshot(docsByStatus.Current);
    validateMathAndLearnerContracts();
    validateStorageContracts();
    validateDocWordingAndTaxonomy();
    validateMathAuthoringReportContracts();
    validateLiveSourceReferences();

    if (errors.length > 0) {
        console.error('\nDocumentation validation failed:');
        for (const error of errors) {
            console.error(`- ${error}`);
        }
        process.exit(1);
    }

    console.log('Documentation is internally consistent.');
    console.log(
        `Verified onboarding snapshot: ${snapshot.sceneCount} scenes, ${snapshot.totalProblems} problems, ${snapshot.levelCount} levels, ${snapshot.npcCount} NPC, ${snapshot.enemyCount} enemy type, ${snapshot.musicCount} music, ${snapshot.sfxCount} SFX.`,
    );
    console.log(
        `Discovered markdown docs by metadata: ${docsByStatus.Current.length} Current, ${docsByStatus.Supportive.length} Supportive, ${docsByStatus.Historical.length} Historical.`,
    );
}

main();
