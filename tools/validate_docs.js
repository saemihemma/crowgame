const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const zlib = require('zlib');

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
    // Governs the production deploy and was outside this map entirely, which is
    // how its "Measured payload" table drifted 2 MB from the artifact it
    // describes without anything noticing.
    'deploy/RAILWAY.md': 'Current',
    'CONTRIBUTING.md': 'Supportive',
    'PRIVACY.md': 'Supportive',
    'SECURITY.md': 'Supportive',
    'LICENSE_ATTRIBUTIONS.md': 'Supportive',
    'brand/README.md': 'Supportive',
    'brand/BRAND_SYSTEM.md': 'Supportive',
    'brand/LEVEL_ART_BIBLE.md': 'Supportive',
    'brand/ASSET_MANIFEST.md': 'Supportive',
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

/**
 * deploy/RAILWAY.md quotes the payload it will serve. Those bytes are on disk,
 * so the table is derived rather than trusted — it had drifted 2 MB. Both columns
 * are derived: the gzip figures were accurate but ungated, and the whole egress
 * argument (~950 MB/month per twice-daily player) is computed from them.
 */
function validateDeployPayloadTable() {
    const DOC = 'deploy/RAILWAY.md';
    const webDir = path.join(root, 'output/web');
    if (!fs.existsSync(webDir)) return;

    const mib = bytes => Math.round((bytes / 1048576) * 10) / 10;

    // The total and the first-launch figure only. The per-file rows were derived
    // too, and correct, and nobody made a decision from them — the decision is
    // "is a first launch acceptable on home wifi", which comes from the total.
    const total = fs.readdirSync(webDir)
        .reduce((sum, f) => sum + fs.statSync(path.join(webDir, f)).size, 0);
    const payload = fs.readdirSync(webDir).filter(f => /\.(wasm|pck|js)$/.test(f));
    const gzipTotal = payload.reduce(
        (acc, f) => acc + zlib.gzipSync(fs.readFileSync(path.join(webDir, f)), { level: 9 }).length, 0);

    ensureDocContains(DOC, `| **whole payload** | **${mib(total)} MB** | **~${mib(gzipTotal)} MB** |`, 'payload totals');
    ensureDocContains(DOC, `a first launch transfers about **${mib(gzipTotal)} MB**`, 'first-launch transfer figure');
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

/** Every doc says what it is for: a Status and an Authority line. */
function validateDocMetadata() {
    const markdownFiles = walkFiles('.', new Set(['.md']));
    const byStatus = { Current: [], Supportive: [], Historical: [] };

    for (const doc of markdownFiles) {
        const text = readText(doc);
        const status = text.match(/^Status:\s+(.+)$/m);
        const authority = text.match(/^Authority:\s+(.+)$/m);
        if (!status) fail(`${doc}: missing Status metadata`);
        else if (!VALID_STATUSES.has(status[1].trim())) fail(`${doc}: invalid Status "${status[1].trim()}"`);
        else byStatus[status[1].trim()].push(doc);

        if (!authority) fail(`${doc}: missing Authority metadata`);
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

}

/** Live code must not point at trees that are not runtime. */
/**
 * The retention and history figures are PROMISES, so they are derived from the
 * defaults they promise.
 *
 * This is the one number in the corpus that earns a gate, and it never had one.
 * Fourteen assertions used to guard the scene count and the SFX count — numbers
 * whose staleness costs a reader nothing — while five separate copies of "30
 * days" sat ungated across PRIVACY.md, SECURITY.md and the runbook. The first of
 * those is a commitment to a parent who cannot read the code to check it.
 *
 * Both figures are env-overridable per deployment. What is asserted is that the
 * docs match the DEFAULT, which is what an unconfigured deploy does and what the
 * pages describe.
 */
function validateRetentionPromises() {
    const configPath = 'server/src/config.ts';
    if (!fs.existsSync(path.join(root, configPath))) return;
    const config = readText(configPath);

    const promises = [
        {
            knob: 'CROW_ERROR_RETAIN_DAYS',
            unit: 'days',
            docs: ['PRIVACY.md', 'SECURITY.md', 'deploy/RAILWAY.md'],
            phrase: (n) => `${n} days`,
            why: 'how long a full error report is kept',
        },
        {
            knob: 'CROW_SAVE_HISTORY_DEPTH',
            unit: 'versions',
            docs: ['SECURITY.md'],
            phrase: (n) => `${n} save versions`,
            why: 'how many save versions a family can roll back through',
        },
    ];

    for (const { knob, unit, docs, phrase, why } of promises) {
        const match = config.match(new RegExp(`int\\('${knob}',\\s*(\\d+)\\)`));
        if (!match) {
            fail(`${configPath}: could not read the default for ${knob}, so the docs that ` +
                 'promise it were compared against nothing. Fix this parser, do not delete the check.');
            continue;
        }
        const wanted = phrase(match[1]);
        for (const doc of docs) {
            if (!fs.existsSync(path.join(root, doc))) continue;
            const text = readText(doc);
            if (!text.includes(wanted)) {
                fail(
                    `${doc}: does not say "${wanted}" — ${knob} defaults to ${match[1]}, and this ` +
                    `doc states ${why}. A stale retention figure is a broken promise, not a typo.`,
                );
                continue;
            }
            // EVERY occurrence, not just one. PRIVACY.md states the window twice,
            // so an `includes` check passed with one copy stale and one fresh —
            // a gate satisfied by the sentence a reader did not happen to read.
            const found = [...text.matchAll(new RegExp(`(\\d+)\\s+${unit}\\b`, 'g'))];
            for (const occurrence of found) {
                if (occurrence[1] !== match[1]) {
                    fail(
                        `${doc}: says "${occurrence[0]}" somewhere as well as "${wanted}" — ` +
                        `${knob} defaults to ${match[1]}. Every copy of a promise has to agree, ` +
                        'because a reader only sees one of them.',
                    );
                }
            }
        }
    }
}

function validateLiveSourceReferences() {
    // The retired-Phaser names are banned outright now that the sweep has landed.
    // They cannot come back without failing the build, which is the point: every
    // one of them was a comment explaining live code against a tree that had been
    // deleted, and a reader has no way to tell such a comment from a true one.
    const banned = [
        { pattern: /\barchived[\\/]/i, label: 'archived/** (deleted)' },
        { pattern: /\bai_assets[\\/]/i, label: 'ai_assets/** (staging, not runtime)' },
        { pattern: /\bpublic[\\/](?:assets|data)[\\/]/i, label: 'public/** (retired Phaser tree)' },
        { pattern: /\bBootScene\b/, label: 'BootScene (retired Phaser tree)' },
        // Named subdirectories AND a bare `src/**` or `src/`. The narrow version
        // missed BRAND_SYSTEM.md's own authority line, which claimed runtime truth
        // lived in `src/**` — in the doc that declares itself canonical.
        // The retired tree was `src/` at the REPO ROOT, so the lookbehind is
        // load-bearing: `server/src/**` and `../src/lib/` are live and must not
        // match. Named subdirectories AND a bare `src/**`, because the narrow
        // earlier version missed BRAND_SYSTEM.md's own authority line claiming
        // runtime truth lived in `src/**` — in the doc that declares itself
        // canonical.
        { pattern: /(?<![\w/.])src[\\/](?:\*\*|[a-z]+[\\/])/i, label: 'src/** (retired Phaser tree)' },
        { pattern: /\bdocs[\\/]API_CONTRACT\.md\b/, label: 'docs/API_CONTRACT.md (now a section of ARCHITECTURE.md)' },
    ];

    // Scanned trees. `.md` and `tools/**` are here because the ban was written
    // for exactly the defect the DOCS then kept: roadmap.md, a Status: Current
    // file, cited `public/data/tilesets/...` and `src/utils/Types.ts` and said
    // "BootScene loads it" — three instructions to look in a tree that does not
    // exist, in the one doc whose job is telling the next person what to do next.
    // A ban that covers only the code it was written from is a ban with a hole
    // the size of the documentation.
    const liveFiles = [
        ...walkFiles('godot/scripts', new Set(['.gd'])),
        ...walkFiles('godot/data', new Set(['.json'])),
        ...walkFiles('math-kernel', new Set(['.ts'])),
        ...walkFiles('tools', new Set(['.js', '.mjs', '.py'])),
        ...walkFiles('godot/tools', new Set(['.mjs', '.py', '.sh'])),
        // server/** was the last hole. It is clean today, which is the reason to
        // include it now rather than after it is not: the ban keeps being extended
        // one tree behind the tree that acquired the defect.
        ...walkFiles('server/src', new Set(['.ts'])),
        ...walkFiles('server/test', new Set(['.ts', '.md'])),
        ...walkFiles('server/migrations', new Set(['.sql'])),
        ...walkFiles('.', new Set(['.md'])),
    ];

    // Line-level escape hatch, same shape as check_hardcoding.py's `# hardcode-ok`.
    //
    // Three references are legitimate and must survive: the two sentences in
    // ARCHITECTURE.md and ONBOARDING.md that DECLARE these trees deleted (the
    // ban's own statement of itself), and one comment in validate_assets.js
    // explaining why the current design exists by contrast with the Phaser
    // original. A blanket ban would have forced those to be reworded into
    // vagueness, which is a worse doc than an accurate past-tense reference.
    //
    // The marker is deliberately per-LINE rather than per-file: a file allowed to
    // mention `src/math/` once should not thereby be allowed to instruct the
    // reader to go and look in it.
    const ALLOW = 'retired-ref-ok';

    for (const file of liveFiles) {
        // This function is the one place the banned strings must appear.
        if (toPosix(file) === 'tools/validate_docs.js') continue;
        const lines = readText(file).split('\n');
        for (let i = 0; i < lines.length; i += 1) {
            if (lines[i].includes(ALLOW)) continue;
            for (const { pattern, label } of banned) {
                if (pattern.test(lines[i])) {
                    fail(
                        `${file}:${i + 1}: contains a reference to ${label}. ` +
                        `If the reference is deliberately historical, mark the line \`${ALLOW}\`.`,
                    );
                }
            }
        }
    }
}

function validateWireContract() {
    const docPath = 'ARCHITECTURE.md';
    const routesDir = 'server/src/routes';
    if (!fs.existsSync(path.join(root, routesDir))) return;

    const registered = new Set();
    for (const file of walkFiles(routesDir, new Set(['.ts']))) {
        const text = readText(file);
        // app.get('/api/v1/x', ...) and the multi-line form where the path is the
        // first argument on its own line.
        const re = /\bapp\s*\.\s*(get|post|put|patch|delete)\s*\(\s*(?:\/\*[\s\S]*?\*\/\s*)?['"`](\/api\/[^'"`]+)['"`]/g;
        let match;
        while ((match = re.exec(text)) !== null) {
            const verb = match[1].toUpperCase();
            const route = match[2].replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '{$1}');
            registered.add(`${verb} ${route}`);
        }
    }

    if (registered.size === 0) {
        fail(
            `${docPath}: no routes could be parsed out of ${routesDir}, so the endpoint ` +
            'table was compared against nothing. Fix this parser rather than deleting the check.',
        );
        return;
    }

    // Table rows look like: | `GET` | `/api/v1/health` | none | ... |
    const documented = new Set();
    const rowRe = /^\|\s*`(GET|POST|PUT|PATCH|DELETE)`\s*\|\s*`([^`]+)`\s*\|/gm;
    let row;
    const docText = readText(docPath);
    while ((row = rowRe.exec(docText)) !== null) {
        documented.add(`${row[1]} ${row[2]}`);
    }

    // The doc writes {id} where the code writes :childId. Compare on shape, not
    // on the parameter's name, or the table has to change when a variable is
    // renamed — which would make the gate annoying, and an annoying gate gets
    // deleted.
    const shape = (entry) => entry.replace(/\{[^}]*\}/g, '{}');
    const registeredShapes = new Map();
    for (const entry of registered) registeredShapes.set(shape(entry), entry);
    const documentedShapes = new Map();
    for (const entry of documented) documentedShapes.set(shape(entry), entry);

    for (const [key, entry] of registeredShapes) {
        if (!documentedShapes.has(key)) {
            fail(
                `${docPath}: the server registers ${entry} and the endpoint table has no row for it. ` +
                'The table is the wire contract a separately-shipped client reads; add the row.',
            );
        }
    }
    for (const [key, entry] of documentedShapes) {
        if (!registeredShapes.has(key)) {
            fail(
                `${docPath}: the endpoint table documents ${entry}, which the server does not register. ` +
                'A client told to call a route that does not exist gets a 404 at runtime.',
            );
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
    validateLearnerConstants();
    validateStorageContracts();
    validateMathAuthoringReports();
    validateRetentionPromises();
    validateLiveSourceReferences();
    validateWireContract();
    validateRoadmapHasNoCompletedItems();
    validateDeployPayloadTable();

    if (errors.length > 0) {
        console.error('\nDocumentation validation failed:');
        for (const error of errors) console.error(`- ${error}`);
        process.exit(1);
    }

    console.log('Documentation is internally consistent.');
    console.log(
        `Docs by metadata: ${byStatus.Current.length} Current, ${byStatus.Supportive.length} Supportive, `
        + `${byStatus.Historical.length} Historical.`,
    );
}

main();
