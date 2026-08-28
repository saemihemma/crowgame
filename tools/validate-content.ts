import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { compileLevel, GID, COLLIDING_TILE_IDS, type LevelSpec } from './level_compiler';
import { deriveCurriculumStep, deriveDifficultyTraits } from './math_curriculum';
import { parseWordedArithmetic } from '../math-kernel/math/wordedArithmetic';
import {
    computeInitialProblemELO,
    loadBandTable,
    materializeMathBatches,
    reviewMaterializedMathBatches,
    type MaterializationResult,
} from './math_authoring';
import { buildPromptUniquenessKey, deriveVerifiedDifficultyTraits, evaluateArithmeticPrompt, isUnrecognisedEquation } from './math_verifier';
import type { MathProblem } from '../math-kernel/utils/Types';

const ROOT = resolve(join(__dirname, '..'));
const DATA_DIR = join(ROOT, 'godot', 'data');
const SCHEMA_DIR = join(DATA_DIR, 'schemas');
const AUTHORING_DIR = join(ROOT, 'authoring', 'math');
const REPORTS_DIR = join(ROOT, 'reports', 'math-batches');

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

let errors = 0;
let validated = 0;

function loadJson(path: string): unknown {
    return JSON.parse(readFileSync(path, 'utf-8'));
}

function validateFile(filePath: string, schemaPath: string, label: string): boolean {
    const schema = loadJson(schemaPath);
    const data = loadJson(filePath);
    const validate = ajv.compile(schema as object);
    const valid = validate(data);

    if (!valid) {
        console.error(`FAIL: ${label} (${filePath})`);
        for (const err of validate.errors || []) {
            console.error(`  - ${err.instancePath || '/'}: ${err.message}`);
        }
        errors++;
        return false;
    }

    console.log(`  OK: ${label}`);
    validated++;
    return true;
}

function validateCrossReferences(): void {
    console.log('\nCross-reference validation:');

    // Load registries
    const levelRegPath = join(DATA_DIR, 'levels', 'level_registry.json');
    const npcRegPath = join(DATA_DIR, 'npcs', 'npc_registry.json');

    if (!existsSync(levelRegPath) || !existsSync(npcRegPath)) {
        console.log('  SKIP: registries not found yet');
        return;
    }

    const levelReg = loadJson(levelRegPath) as { levels: Array<{ key: string }> };
    const npcReg = loadJson(npcRegPath) as { npcs: Array<{ id: string }> };

    const levelKeys = new Set(levelReg.levels.map(l => l.key));
    const npcIds = new Set(npcReg.npcs.map(n => n.id));

    for (const level of levelReg.levels as Array<{ key: string; mapFile?: string }>) {
        if (!level.mapFile) {
            console.error(`  FAIL: Level registry entry ${level.key} missing mapFile`);
            errors++;
            continue;
        }

        const mapPath = join(ROOT, 'godot', level.mapFile);
        if (!existsSync(mapPath)) {
            console.error(`  FAIL: Level registry entry ${level.key} points to missing map: ${level.mapFile}`);
            errors++;
        }
    }

    // chainLinks is surfaced for art and the HUD, but it is not a second source
    // of truth: it must equal the math_challenge component's problemCount.
    for (const npc of npcReg.npcs as Array<Record<string, unknown>>) {
        const components = (npc.components ?? []) as Array<Record<string, unknown>>;
        const math = components.find(c => c.type === 'math_challenge');
        if (!math) {
            continue;
        }
        const links = (npc.behaviorConfig as Record<string, unknown> | undefined)?.chainLinks;
        if (links !== undefined && links !== math.problemCount) {
            console.error(`  FAIL: NPC ${String(npc.id)} chainLinks ${String(links)} != problemCount ${String(math.problemCount)}`);
            errors++;
        }
    }

    // Validate level specs reference valid NPCs
    const specsDir = join(DATA_DIR, 'levels', 'specs');
    if (existsSync(specsDir)) {
        for (const file of readdirSync(specsDir).filter(f => f.endsWith('.json'))) {
            const spec = loadJson(join(specsDir, file)) as {
                id: string;
                spawns: {
                    npcs?: Array<{ npc_id: string }>;
                    collectibles?: Array<{ type: string; id?: string }>;
                };
                exits: Array<{ target_level: string }>;
            };

            // Check NPC references
            for (const npc of spec.spawns.npcs || []) {
                if (!npcIds.has(npc.npc_id)) {
                    console.error(`  FAIL: ${file} references unknown NPC: ${npc.npc_id}`);
                    errors++;
                }
            }

            // Check player spawn exists
            if (!spec.spawns || !('player' in spec.spawns)) {
                console.error(`  FAIL: ${file} missing player spawn point`);
                errors++;
            }

            // Big coins are identified by an explicit id, and the save records
            // that id. A missing one means the coin can never be banked; a
            // duplicated one means two coins share a record, so collecting
            // either marks both -- and both failures are silent at runtime,
            // which is why they are caught here instead.
            const coinIds = new Set<string>();
            for (const col of spec.spawns.collectibles || []) {
                if (col.type !== 'big_coin') continue;
                if (!col.id) {
                    console.error(`  FAIL: ${file} has a big_coin with no id; it could never be banked`);
                    errors++;
                    continue;
                }
                if (coinIds.has(col.id)) {
                    console.error(`  FAIL: ${file} reuses big_coin id "${col.id}"; two coins would share one record`);
                    errors++;
                }
                coinIds.add(col.id);
            }
        }
    }

    // Validate math problems: MCQ options contain correct answer
    const mathDir = join(DATA_DIR, 'math');
    if (existsSync(mathDir)) {
        const problemIds = new Set<string>();
        const promptKeys = new Map<string, string>();
        for (const file of readdirSync(mathDir).filter(f => f.startsWith('problems_') && f.endsWith('.json'))) {
            const pool = loadJson(join(mathDir, file)) as {
                problems: Array<{
                    id: string;
                    prompt: { text: string };
                    answer: { mode: string; correct: number; options?: number[] };
                }>;
            };

            for (const problem of pool.problems) {
                // Unique ID check
                if (problemIds.has(problem.id)) {
                    console.error(`  FAIL: Duplicate problem ID: ${problem.id} in ${file}`);
                    errors++;
                }
                problemIds.add(problem.id);

                const promptKey = buildPromptUniquenessKey(problem.prompt.text);
                const priorFile = promptKeys.get(promptKey);
                if (priorFile) {
                    console.error(`  FAIL: Duplicate prompt text across math pools: "${problem.prompt.text}" in ${file} and ${priorFile}`);
                    errors++;
                } else {
                    promptKeys.set(promptKey, file);
                }

                // MCQ must contain correct answer in options
                if (problem.answer.mode === 'mcq' && problem.answer.options) {
                    if (!problem.answer.options.includes(problem.answer.correct)) {
                        console.error(`  FAIL: Problem ${problem.id} MCQ options don't contain correct answer ${problem.answer.correct}`);
                        errors++;
                    }
                }

                validateProblemMetadata(problem as MathProblem, file);
            }
        }
    }

    if (errors === 0) {
        console.log('  OK: All cross-references valid');
    }
}

function validateMathAuthoringFiles(): void {
    console.log('\nMath authoring sources:');

    const seedPath = join(AUTHORING_DIR, 'seed', 'problems_curriculum_seed.json');
    const bandPath = join(AUTHORING_DIR, 'band-table.json');
    const batchPath = join(AUTHORING_DIR, 'batches.json');

    if (!existsSync(seedPath) || !existsSync(bandPath) || !existsSync(batchPath)) {
        console.error('  FAIL: math authoring layer is missing one or more required files');
        errors++;
        return;
    }

    validateFile(seedPath, join(SCHEMA_DIR, 'math-problem.schema.json'), 'problems_curriculum_seed.json');
    validateFile(bandPath, join(AUTHORING_DIR, 'schemas', 'math-band-table.schema.json'), 'band-table.json');
    validateFile(batchPath, join(AUTHORING_DIR, 'schemas', 'math-batches.schema.json'), 'batches.json');
    validateMathBandMonotonicity(bandPath);
    validateStoryOperandCeiling();
}

/**
 * Later rungs get harder windows. Nothing used to check it.
 *
 * docs/MATH_AUTHORING_STANDARDS.md §2.5 has always said "later steps get
 * strictly higher windows; overlap between adjacent bands is fine, inversion is
 * not", and the only enforcement was that each problem's ELO falls inside its
 * OWN band -- which stays true no matter how the bands are ordered. A band whose
 * ceiling dropped below its predecessor's would grade `117 + 19` easier than
 * `96 + 7`, and every gate would pass. That is exactly what a band added in
 * 2026-08 did, and this is what caught it.
 *
 * Bands are compared in step order, per domain. Two bands STARTING on the same
 * step are two facets of one rung (carry and no-carry, say), so they are exempt
 * from each other: the rule is about what a child meets LATER, not about which
 * of two shapes on the same rung is harder. Equal bounds are fine; only a drop
 * is an inversion.
 */
function validateMathBandMonotonicity(bandPath: string): void {
    type Band = {
        id: string;
        domain: string;
        curriculumStepRange: [number, number];
        targetEloRange: [number, number];
    };
    const bands = (JSON.parse(readFileSync(bandPath, 'utf-8')) as { bands: Band[] }).bands;
    const byDomain = new Map<string, Band[]>();
    for (const band of bands) {
        const list = byDomain.get(band.domain) ?? [];
        list.push(band);
        byDomain.set(band.domain, list);
    }

    let inversions = 0;
    for (const [domain, list] of byDomain) {
        list.sort((left, right) =>
            left.curriculumStepRange[0] - right.curriculumStepRange[0]
            || left.curriculumStepRange[1] - right.curriculumStepRange[1]);
        for (let i = 1; i < list.length; i++) {
            const earlier = list[i - 1];
            const later = list[i];
            if (later.curriculumStepRange[0] === earlier.curriculumStepRange[0]) continue;
            const droppedFloor = later.targetEloRange[0] < earlier.targetEloRange[0];
            const droppedCeiling = later.targetEloRange[1] < earlier.targetEloRange[1];
            if (!droppedFloor && !droppedCeiling) continue;
            inversions++;
            errors++;
            console.error(
                `  FAIL: ${domain} band ${later.id} (steps ${later.curriculumStepRange.join('-')}, `
                + `ELO ${later.targetEloRange.join('-')}) starts later than ${earlier.id} `
                + `(steps ${earlier.curriculumStepRange.join('-')}, ELO ${earlier.targetEloRange.join('-')}) `
                + `but its ${droppedFloor && droppedCeiling ? 'window' : droppedFloor ? 'floor' : 'ceiling'} is lower. `
                + 'MATH_AUTHORING_STANDARDS.md §2.5: overlap is fine, inversion is not.',
            );
        }
    }

    if (inversions === 0) {
        console.log(`  OK: ${bands.length} ELO bands climb with their step ranges in every domain`);
        validated++;
    }
}

/**
 * Big numbers stay abstract.
 *
 * MATH_AUTHORING_STANDARDS.md §4: "Story framing stops at two-digit facts; a
 * child sharing 847 berries is not a story, it is noise. Three- and four-digit
 * steps use equation forms only." The rule was written and nothing enforced it,
 * so 56 of the 300 multi-digit problems on main were word problems — because a
 * template that lists framings without `strictVariants` gets the whole fallback
 * set unioned in, stories included, and four batches did exactly that.
 *
 * Stated over the FACT rather than the step, because the fact is what makes the
 * sentence silly: a three-digit story is noise wherever it lands.
 */
function validateStoryOperandCeiling(): void {
    const TWO_DIGIT_MAX = 99;
    const mathDir = join(DATA_DIR, 'math');
    if (!existsSync(mathDir)) return;

    let checked = 0;
    let offenders = 0;
    for (const file of readdirSync(mathDir).filter(f => f.endsWith('.json'))) {
        const pool = JSON.parse(readFileSync(join(mathDir, file), 'utf-8')) as { problems?: MathProblem[] };
        for (const problem of pool.problems ?? []) {
            const worded = parseWordedArithmetic(problem.prompt.text);
            if (!worded) continue;
            checked++;
            if (Math.max(worded.left, worded.right) <= TWO_DIGIT_MAX) continue;
            offenders++;
            errors++;
            if (offenders <= 5) {
                console.error(
                    `  FAIL: ${problem.id} tells a story about ${Math.max(worded.left, worded.right)} `
                    + `(step ${problem.curriculumStep}). §4: story framing stops at two-digit facts. `
                    + 'Set strictVariants on the template so the fallback set cannot union stories in.',
                );
            }
        }
    }
    if (offenders > 5) {
        console.error(`  FAIL: ...and ${offenders - 5} more three- or four-digit stories`);
    }
    if (offenders === 0) {
        console.log(`  OK: all ${checked} word problems keep their numbers inside two digits`);
        validated++;
    }
}

function validateProblemMetadata(problem: MathProblem, file: string): void {
    // An equation whose shape nothing recognises must never reach the checks
    // below, because both of them SKIP when the parse comes back empty -- so an
    // unrecognised shape would ship with neither its answer nor its operands
    // ever independently re-derived. Refuse it instead.
    if (isUnrecognisedEquation(problem.prompt.text)) {
        console.error(
            `  FAIL: Problem ${problem.id} in ${file} is an equation whose unknown is not alone `
            + `at the end ("${problem.prompt.text}"). Nothing can verify it. Teach `
            + `parseRelationalPrompt in tools/math_verifier.ts its shape first.`,
        );
        errors++;
        return;
    }

    const evaluatedAnswer = evaluateArithmeticPrompt(problem.prompt.text);
    if (evaluatedAnswer !== null && problem.answer.correct !== evaluatedAnswer) {
        console.error(
            `  FAIL: Problem ${problem.id} in ${file} has correct answer ${problem.answer.correct}, expected ${evaluatedAnswer}`,
        );
        errors++;
    }

    const expectedStep = deriveCurriculumStep(problem);
    if (problem.curriculumStep !== expectedStep) {
        console.error(
            `  FAIL: Problem ${problem.id} in ${file} has curriculumStep ${problem.curriculumStep}, expected ${expectedStep}`,
        );
        errors++;
    }

    const expectedTraits = deriveVerifiedDifficultyTraits(problem) ?? deriveDifficultyTraits(problem);
    const actualTraits = problem.difficultyTraits;

    if (!expectedTraits) {
        return;
    }

    if (!actualTraits) {
        console.error(`  FAIL: Problem ${problem.id} in ${file} missing difficultyTraits`);
        errors++;
        return;
    }

    if (actualTraits.maxOperand !== expectedTraits.maxOperand) {
        console.error(
            `  FAIL: Problem ${problem.id} in ${file} has maxOperand ${actualTraits.maxOperand}, expected ${expectedTraits.maxOperand}`,
        );
        errors++;
    }

    if ((actualTraits.requiresCarry ?? false) !== (expectedTraits.requiresCarry ?? false)) {
        console.error(`  FAIL: Problem ${problem.id} in ${file} has incorrect requiresCarry flag`);
        errors++;
    }

    if ((actualTraits.requiresBorrow ?? false) !== (expectedTraits.requiresBorrow ?? false)) {
        console.error(`  FAIL: Problem ${problem.id} in ${file} has incorrect requiresBorrow flag`);
        errors++;
    }
}

/**
 * Name what actually differs between a compiled level and its spec.
 *
 * The old message just said "run compile", which is only right when the spec is
 * the newer side. It was not: level_05 and level_99 carried hand-placed owl ids
 * (`owl_gauntlet`, `owl_twin_chain`) that the specs had flattened to
 * `owl_teacher_01`, and recompiling would have turned a three-problem
 * hardest-band gauntlet into one easy question. A diff you can read is the
 * difference between fixing the drift and deleting content to silence it.
 */
function describeLevelDrift(actual: unknown, expected: unknown): string[] {
    const lines: string[] = [];
    const walk = (a: unknown, b: unknown, path: string): void => {
        if (lines.length >= 10) {
            return;
        }
        if (JSON.stringify(a) === JSON.stringify(b)) {
            return;
        }
        const bothObjects = a !== null && b !== null && typeof a === 'object' && typeof b === 'object';
        if (bothObjects && Array.isArray(a) === Array.isArray(b)) {
            const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
            for (const key of keys) {
                walk(
                    (a as Record<string, unknown>)[key],
                    (b as Record<string, unknown>)[key],
                    path ? `${path}.${key}` : key,
                );
            }
            return;
        }
        lines.push(`${path}: compiled has ${JSON.stringify(a)}, spec compiles to ${JSON.stringify(b)}`);
    };
    walk(actual, expected, '');
    if (lines.length >= 10) {
        lines.push('... (further differences not listed)');
    }
    return lines;
}

function validateCompiledLevels(): void {
    console.log('\nCompiled level freshness:');

    const specsDir = join(DATA_DIR, 'levels', 'specs');
    const compiledDir = join(DATA_DIR, 'levels', 'compiled');
    if (!existsSync(specsDir) || !existsSync(compiledDir)) {
        console.log('  SKIP: specs or compiled directory missing');
        return;
    }

    for (const file of readdirSync(specsDir).filter(f => f.endsWith('.json'))) {
        const specPath = join(specsDir, file);
        const compiledName = file.replace('.spec.json', '.json');
        const compiledPath = join(compiledDir, compiledName);

        if (!existsSync(compiledPath)) {
            console.error(`  FAIL: Missing compiled level for ${file}: compiled/${compiledName}`);
            errors++;
            continue;
        }

        const spec = loadJson(specPath) as LevelSpec;
        const expected = compileLevel(spec);
        const actual = loadJson(compiledPath);

        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            console.error(`  FAIL: Compiled level drift detected for ${file}.`);
            for (const line of describeLevelDrift(actual, expected)) {
                console.error(`         ${line}`);
            }
            console.error('         Decide which side is right BEFORE running npm run compile:');
            console.error('         compile overwrites compiled/ from the spec, so if the compiled');
            console.error('         file is the newer one, that erases the difference above.');
            errors++;
            continue;
        }
    }

    if (errors === 0) {
        console.log('  OK: Compiled levels match authored specs');
    }
}

function validateMaterializedCurriculum(): MaterializationResult | null {
    console.log('\nMaterialized math drift:');

    const currentPath = join(DATA_DIR, 'math', 'problems_curriculum.json');
    if (!existsSync(currentPath)) {
        console.error('  FAIL: current curriculum pool missing');
        errors++;
        return null;
    }

    const materialized = materializeMathBatches();
    const current = loadJson(currentPath);

    /**
     * Compare without the phrasing overlay.
     *
     * `phrasing` is derived on top of a materialized pool by
     * tools/derive_math_phrasing.mjs, so the materializer does not and should not
     * produce it. Comparing it here would report permanent drift on a pool that
     * is exactly right. The overlay has its own gates in tools/validate_i18n.mjs:
     * every entry must round-trip through its English template, agree with the
     * problem's own answer, and be present wherever there is English to
     * translate.
     */
    const withoutPhrasing = (pool: unknown) => JSON.stringify(pool, (key, value) =>
        (key === 'phrasing' ? undefined : value));

    if (withoutPhrasing(current) !== withoutPhrasing(materialized.curriculumPool)) {
        console.error('  FAIL: Materialized curriculum drift detected. Run npm.cmd run math:materialize.');
        errors++;
    }

    const bandLookup = new Map(loadBandTable().bands.map(band => [band.id, band]));
    for (const problem of materialized.generatedProblems) {
        const params = (problem.generator as { params?: Record<string, unknown> } | null)?.params;
        const bandId = typeof params?.bandId === 'string' ? params.bandId : '';
        const band = bandLookup.get(bandId);
        if (!band) {
            console.error(`  FAIL: Generated problem ${problem.id} is missing a valid bandId`);
            errors++;
            continue;
        }

        const elo = computeInitialProblemELO(problem.difficulty);
        if (problem.curriculumStep < band.curriculumStepRange[0] || problem.curriculumStep > band.curriculumStepRange[1]) {
            console.error(`  FAIL: Generated problem ${problem.id} step ${problem.curriculumStep} is outside band ${band.id}`);
            errors++;
        }
        if (elo < band.targetEloRange[0] || elo > band.targetEloRange[1]) {
            console.error(`  FAIL: Generated problem ${problem.id} initial ELO ${elo} is outside band ${band.id}`);
            errors++;
        }
    }

    if (errors === 0) {
        console.log('  OK: Materialized curriculum matches authoring sources');
    }

    return materialized;
}

function collectMathReviewGateFailures(review: ReturnType<typeof reviewMaterializedMathBatches>): string[] {
    const failures: string[] = [];

    if (review.acceptedBatchCount !== review.batchReviews.length) {
        failures.push(`accepted batches ${review.acceptedBatchCount}/${review.batchReviews.length}`);
    }

    if (review.averageAcceptedGrade < 9.0) {
        failures.push(`average accepted grade ${review.averageAcceptedGrade} < 9.0`);
    }

    if (!review.runtimeSelectorSmoke.accepted) {
        failures.push('runtime selector smoke not accepted');
    }

    for (const roleGrade of review.runtimeSelectorSmoke.roleGrades) {
        if (roleGrade.grade < 8.5) {
            failures.push(`runtime selector smoke ${roleGrade.role} grade ${roleGrade.grade} < 8.5`);
        }
    }

    for (const batch of review.batchReviews) {
        if (!batch.accepted) {
            failures.push(`${batch.batchId} rejected`);
        }

        const roleGrades = [
            ...batch.templateReview.roleGrades,
            ...batch.concreteReview.roleGrades,
            ...batch.simulationReview.roleGrades,
        ];
        for (const roleGrade of roleGrades) {
            if (roleGrade.grade < 8.5) {
                failures.push(`${batch.batchId} ${roleGrade.role} grade ${roleGrade.grade} < 8.5`);
            }
        }
    }

    return failures;
}

function validateMathReviewReports(materialized: MaterializationResult | null): void {
    console.log('\nMath review report freshness:');

    if (!materialized) {
        console.error('  FAIL: cannot validate review reports without materialized curriculum');
        errors++;
        return;
    }

    const reviewSummaryPath = join(REPORTS_DIR, 'review-summary.json');
    const runtimeSmokePath = join(REPORTS_DIR, 'runtime-selector-smoke.json');
    const owlSurfacePath = join(REPORTS_DIR, 'owl-surface-summary.json');
    const batchesDir = join(REPORTS_DIR, 'batches');

    const requiredPaths = [reviewSummaryPath, runtimeSmokePath, owlSurfacePath, batchesDir];
    for (const requiredPath of requiredPaths) {
        if (!existsSync(requiredPath)) {
            console.error(`  FAIL: Missing math review artifact: ${requiredPath}`);
            errors++;
            return;
        }
    }

    const computedReview = reviewMaterializedMathBatches(materialized);
    const savedReview = loadJson(reviewSummaryPath);
    const savedRuntimeSmoke = loadJson(runtimeSmokePath);
    const savedOwlSurface = loadJson(owlSurfacePath);
    if (JSON.stringify(savedReview) !== JSON.stringify(computedReview)) {
        console.error('  FAIL: Review summary drift detected. Run npm.cmd run math:materialize.');
        errors++;
    }

    if (JSON.stringify(savedRuntimeSmoke) !== JSON.stringify(computedReview.runtimeSelectorSmoke)) {
        console.error('  FAIL: Runtime selector smoke drift detected. Run npm.cmd run math:materialize.');
        errors++;
    }

    if (JSON.stringify(savedOwlSurface) !== JSON.stringify(computedReview.owlSurface)) {
        console.error('  FAIL: Owl surface summary drift detected. Run npm.cmd run math:materialize.');
        errors++;
    }

    const gateFailures = collectMathReviewGateFailures(computedReview);
    for (const failure of gateFailures) {
        console.error(`  FAIL: Math review gate failed: ${failure}`);
        errors++;
    }

    // The Phaser-era browser-smoke gate used to live here. It was removed, not
    // relaxed, for two independent reasons:
    //
    //  1. It fingerprinted src/scenes/GameScene.ts, src/scenes/MathChallengeScene.ts
    //     and src/entities/npc/** — the Phaser owl loop, which is no longer the
    //     shipped game. Godot is.
    //  2. It never actually held. The stored fingerprint in
    //     reports/math-batches/runtime-browser-smoke.json matched the committed
    //     sources under neither LF nor CRLF, from the initial import onward, so
    //     `npm run validate` failed for everyone on every machine. CI's old
    //     `paths: ['godot/**']` filter meant nobody saw it.
    //
    // Replaced by two gates that run against the thing that actually ships:
    //   - godot/tests/integration/OwlProbe.tscn  (the owl loop, in-engine)
    //   - godot/tools/web_boot_smoke.mjs         (the exported build, in a browser)

    const savedBatchFiles = new Set(readdirSync(batchesDir).filter(file => file.endsWith('.json')));
    const expectedBatchFiles = new Set(computedReview.batchReviews.map(review => `${review.batchId}.json`));

    for (const expectedFile of expectedBatchFiles) {
        if (!savedBatchFiles.has(expectedFile)) {
            console.error(`  FAIL: Missing batch review artifact ${expectedFile}. Run npm.cmd run math:materialize.`);
            errors++;
        }
    }

    for (const savedFile of savedBatchFiles) {
        if (!expectedBatchFiles.has(savedFile)) {
            console.error(`  FAIL: Unexpected batch review artifact ${savedFile}. Run npm.cmd run math:materialize.`);
            errors++;
            continue;
        }

        const savedBatch = loadJson(join(batchesDir, savedFile));
        const expectedBatch = computedReview.batchReviews.find(review => `${review.batchId}.json` === savedFile);
        if (JSON.stringify(savedBatch) !== JSON.stringify(expectedBatch)) {
            console.error(`  FAIL: Batch review drift detected for ${savedFile}. Run npm.cmd run math:materialize.`);
            errors++;
        }
    }

    if (errors === 0) {
        console.log('  OK: Math review artifacts are fresh and deterministic');
    }
}

// Main validation
console.log('Validating content...\n');

// Player tuning
console.log('Player tuning:');
const tuningPath = join(DATA_DIR, 'tuning', 'player_base.json');
if (existsSync(tuningPath)) {
    validateFile(tuningPath, join(SCHEMA_DIR, 'player-tuning.schema.json'), 'player_base.json');
}

// Level registry
console.log('\nLevel registry:');
const levelRegPath = join(DATA_DIR, 'levels', 'level_registry.json');
if (existsSync(levelRegPath)) {
    validateFile(levelRegPath, join(SCHEMA_DIR, 'level-registry.schema.json'), 'level_registry.json');
}

// Level specs
console.log('\nLevel specs:');
const specsDir = join(DATA_DIR, 'levels', 'specs');
if (existsSync(specsDir)) {
    for (const file of readdirSync(specsDir).filter(f => f.endsWith('.json'))) {
        validateFile(join(specsDir, file), join(SCHEMA_DIR, 'level-spec.schema.json'), file);
    }
}

// NPC registry
console.log('\nNPC registry:');
const npcRegPath = join(DATA_DIR, 'npcs', 'npc_registry.json');
if (existsSync(npcRegPath)) {
    validateFile(npcRegPath, join(SCHEMA_DIR, 'npc-registry.schema.json'), 'npc_registry.json');
}

// Math problems
console.log('\nMath problems:');
const mathDir = join(DATA_DIR, 'math');
if (existsSync(mathDir)) {
    for (const file of readdirSync(mathDir).filter(f => f.startsWith('problems_') && f.endsWith('.json'))) {
        validateFile(join(mathDir, file), join(SCHEMA_DIR, 'math-problem.schema.json'), file);
    }
}

validateMathAuthoringFiles();

// NOTE: a validateGodotMathDataSync() check used to live here, comparing the
// Phaser-era public/data/math twin against godot/data/math. Once public/ was
// deleted both sides of that comparison resolved to godot/data/math, so it
// compared the tree against itself: always green, and it still incremented the
// validated counter. Removed rather than repaired — godot/data is now the only
// copy, so there is no longer a twin that can drift.

// The per-level math mixes are a designed curriculum: every level's gating
// names a teaching intent, its skill order sets the owl's emphasis, and the
// chain as a whole must cover every skill the owl can serve. These guards
// keep the design from rotting as specs, registries, or pools change.
function validateLevelMathGating(): void {
    const MIN_PROBLEMS_IN_BAND = 30;

    const specsDir = join(DATA_DIR, 'levels', 'specs');
    if (!existsSync(specsDir)) return;

    type Gating = { skills: string[]; difficultyBand: [number, number]; teachingIntent?: string };
    const specGating = new Map<string, Gating>();
    for (const file of readdirSync(specsDir).filter(f => f.endsWith('.spec.json'))) {
        const spec = JSON.parse(readFileSync(join(specsDir, file), 'utf-8')) as { id: string; mathGating?: Gating };
        if (!spec.mathGating) {
            console.error(`  FAIL: ${file} has no mathGating — every level must name its math identity.`);
            errors++;
            continue;
        }
        if (!spec.mathGating.teachingIntent || spec.mathGating.teachingIntent.trim() === '') {
            console.error(`  FAIL: ${file} mathGating has no teachingIntent — every gating decision must name the lesson it teaches.`);
            errors++;
        }
        specGating.set(spec.id, spec.mathGating);
    }

    // NOTE: a byte-for-byte comparison of the two ports' level registries used to
    // sit here. With public/ deleted, DATA_DIR resolves to godot/data, so both
    // sides named the same file and the check could never fail. Dropped for the
    // same reason as validateGodotMathDataSync() above; the gating cross-check
    // below is the part that still has something to prove.
    const webLevelReg = join(DATA_DIR, 'levels', 'level_registry.json');
    const registry = JSON.parse(readFileSync(webLevelReg, 'utf-8')) as { levels: Array<{ id: string; mathGating?: Gating }> };
    for (const entry of registry.levels) {
        const fromSpec = specGating.get(entry.id);
        if (!fromSpec) continue;
        if (JSON.stringify(entry.mathGating) !== JSON.stringify(fromSpec)) {
            console.error(`  FAIL: level_registry mathGating for ${entry.id} differs from its spec. The spec is the author; re-mirror it.`);
            errors++;
        }
    }

    // Every gated skill must be one the owl can actually serve: inside the
    // NPC superset, and with enough authored problems inside the band.
    const npcRegistry = JSON.parse(readFileSync(join(DATA_DIR, 'npcs', 'npc_registry.json'), 'utf-8')) as {
        npcs: Array<{ components: Array<{ type: string; problemTypes?: string[] }> }>;
    };
    const owlDomains = new Set(
        npcRegistry.npcs.flatMap(npc => npc.components).find(c => c.type === 'math_challenge')?.problemTypes ?? [],
    );
    const byDomain = new Map<string, MathProblem[]>();
    for (const file of readdirSync(join(DATA_DIR, 'math')).filter(f => f.startsWith('problems_') && f.endsWith('.json'))) {
        const pool = JSON.parse(readFileSync(join(DATA_DIR, 'math', file), 'utf-8')) as { problems?: MathProblem[] };
        for (const problem of pool.problems ?? []) {
            const list = byDomain.get(problem.domain) ?? [];
            list.push(problem);
            byDomain.set(problem.domain, list);
        }
    }

    const covered = new Set<string>();
    for (const [levelId, gating] of specGating) {
        for (const skill of gating.skills) {
            covered.add(skill);
            if (!owlDomains.has(skill)) {
                console.error(`  FAIL: ${levelId} gates to "${skill}" but the owl's problemTypes cannot serve it.`);
                errors++;
                continue;
            }
            const [lo, hi] = gating.difficultyBand;
            const inBand = (byDomain.get(skill) ?? []).filter(p => p.difficulty >= lo && p.difficulty <= hi).length;
            if (inBand < MIN_PROBLEMS_IN_BAND) {
                console.error(`  FAIL: ${levelId} gates "${skill}" to band [${lo}, ${hi}] but only ${inBand} problems live there (need ${MIN_PROBLEMS_IN_BAND}).`);
                errors++;
            }
        }
    }
    // Every domain the owl can serve must have a level that teaches it. The
    // list comes from the NPC config itself, so enabling a new domain for the
    // owl immediately demands a home in the chain — no list to remember.
    const missing = [...owlDomains].filter(domain => !covered.has(domain));
    if (missing.length > 0) {
        console.error(`  FAIL: no level in the chain teaches: ${missing.join(', ')} — every owl-servable domain needs a home.`);
        errors++;
    } else {
        validated++;
    }
}
validateLevelMathGating();

// The analytics problem catalog (server/src/generated/problemCatalog.ts) maps
// problem_id -> domain + kind for the parent report. It is generated from the
// pools; a stale copy silently mislabels a child's accuracy matrix, so drift
// fails validation instead.
function validateProblemCatalogFreshness(): void {
    const catalogPath = join(ROOT, 'server', 'src', 'generated', 'problemCatalog.ts');
    if (!existsSync(catalogPath)) {
        console.error('  FAIL: server/src/generated/problemCatalog.ts is missing. Run: npx tsx tools/gen_problem_catalog.ts');
        errors++;
        return;
    }
    const source = readFileSync(catalogPath, 'utf-8');
    const match = source.match(/POOLS_HASH = "([0-9a-f]{64})"/);
    if (!match) {
        console.error('  FAIL: problemCatalog.ts carries no POOLS_HASH; regenerate it.');
        errors++;
        return;
    }
    const { createHash } = require('node:crypto') as typeof import('node:crypto');
    const hash = createHash('sha256');
    const mathDataDir = join(DATA_DIR, 'math');
    for (const file of readdirSync(mathDataDir).filter((f: string) => f.endsWith('.json')).sort()) {
        hash.update(file).update('\0').update(readFileSync(join(mathDataDir, file), 'utf-8'));
    }
    if (hash.digest('hex') !== match[1]) {
        console.error('  FAIL: the analytics problem catalog is stale against godot/data/math. Run: npx tsx tools/gen_problem_catalog.ts');
        errors++;
    } else {
        validated++;
    }
}
validateProblemCatalogFreshness();
/**
 * The lane weights the API recommends against must be the ones the game plays
 * with. The API image contains no godot/data (deploy/api/Dockerfile copies only
 * `server/`), so they are generated in -- and a generated copy that nothing
 * checks is a copy that drifts. See tools/gen_ladder_weights.ts.
 */
function validateLadderWeightsFreshness(): void {
    console.log('\nLadder weights freshness:');
    const generated = join(ROOT, 'server', 'src', 'generated', 'ladderWeights.ts');
    if (!existsSync(generated)) {
        console.error('  FAIL: server/src/generated/ladderWeights.ts is missing. Run: npx tsx tools/gen_ladder_weights.ts');
        errors++;
        return;
    }
    const source = readFileSync(generated, 'utf-8');
    const match = source.match(/TUNING_HASH = "([0-9a-f]{64})"/);
    if (!match) {
        console.error('  FAIL: ladderWeights.ts carries no TUNING_HASH; regenerate it.');
        errors++;
        return;
    }
    const { createHash } = require('node:crypto') as typeof import('node:crypto');
    const tuningPath = join(DATA_DIR, 'tuning', 'math_tuning.json');
    const actual = createHash('sha256').update(readFileSync(tuningPath, 'utf-8')).digest('hex');
    if (actual !== match[1]) {
        console.error('  FAIL: the API\'s lane weights are stale against godot/data/tuning/math_tuning.json. '
            + 'Run: npx tsx tools/gen_ladder_weights.ts');
        errors++;
    } else {
        console.log('  OK: the API recommends against the weights the game plays with');
        validated++;
    }
}
validateLadderWeightsFreshness();

// The parent report renders TextManager.t("kind_" + kind) and ("domain_" + d).
// Those prefixes are exempt from the dead-key scanner because they are built at
// runtime — which means a NEW kind or newly served domain without a translation
// would silently show a raw key to a parent. Close the loop from this side:
// every kind the catalog can emit and every owl-servable domain must have its
// string in BOTH bundles.
function validateAnalyticsI18nCoverage(): void {
    const catalogPath = join(ROOT, 'server', 'src', 'generated', 'problemCatalog.ts');
    if (!existsSync(catalogPath)) return; // freshness check above already failed
    const source = readFileSync(catalogPath, 'utf-8');
    const kinds = new Set<string>();
    for (const match of source.matchAll(/"k":"(\w+)"/g)) kinds.add(match[1]!);

    const npcRegistry = JSON.parse(readFileSync(join(DATA_DIR, 'npcs', 'npc_registry.json'), 'utf-8')) as {
        npcs: Array<{ components: Array<{ type: string; problemTypes?: string[] }> }>;
    };
    const domains = new Set(
        npcRegistry.npcs.flatMap(npc => npc.components)
            .filter(c => c.type === 'math_challenge')
            .flatMap(c => c.problemTypes ?? []),
    );

    for (const locale of ['en', 'is']) {
        const bundle = JSON.parse(readFileSync(join(DATA_DIR, 'i18n', `strings_${locale}.json`), 'utf-8')) as Record<string, string>;
        for (const kind of kinds) {
            if (!(`kind_${kind}` in bundle)) {
                console.error(`  FAIL: strings_${locale}.json is missing "kind_${kind}" — the parent report would show a raw key.`);
                errors++;
            }
        }
        for (const domain of domains) {
            if (!(`domain_${domain}` in bundle)) {
                console.error(`  FAIL: strings_${locale}.json is missing "domain_${domain}" — the parent report would show a raw key.`);
                errors++;
            }
        }
    }
    validated++;
}
validateAnalyticsI18nCoverage();

// The Icelandic grade-expectation mapping (godot/data/curriculum/
// grade_expectations.json -> server/src/generated/gradeExpectations.ts) is what
// lets the parent report say "ahead / on track / practice" against a school
// grade. Three ways it can rot, all closed here: the generated copy drifts from
// the source; a newly served domain has no milestones (a new math domain would
// silently get no grade verdict); or a milestone points at a ladder step the
// curriculum pools do not actually author (a verdict no child could ever earn).
function validateGradeExpectations(): void {
    const srcPath = join(DATA_DIR, 'curriculum', 'grade_expectations.json');
    const genPath = join(ROOT, 'server', 'src', 'generated', 'gradeExpectations.ts');
    if (!existsSync(srcPath) || !existsSync(genPath)) {
        console.error('  FAIL: grade expectations missing. Source: godot/data/curriculum/grade_expectations.json; run: npx tsx tools/gen_grade_expectations.ts');
        errors++;
        return;
    }
    const raw = readFileSync(srcPath, 'utf-8');
    const { createHash } = require('node:crypto') as typeof import('node:crypto');
    const expected = createHash('sha256').update(raw).digest('hex');
    const generated = readFileSync(genPath, 'utf-8');
    const match = generated.match(/GRADE_EXPECTATIONS_HASH = "([0-9a-f]{64})"/);
    if (!match || match[1] !== expected) {
        console.error('  FAIL: gradeExpectations.ts is stale against godot/data/curriculum/grade_expectations.json. Run: npx tsx tools/gen_grade_expectations.ts');
        errors++;
        return;
    }

    const source = JSON.parse(raw) as {
        meta: { sources: Array<{ id: string }> };
        domains: Record<string, Array<{ endOfGrade: number; step: number; covers?: string; basis?: string; source?: string }>>;
    };
    const sourceIds = new Set(source.meta.sources.map(s => s.id));

    const npcRegistry = JSON.parse(readFileSync(join(DATA_DIR, 'npcs', 'npc_registry.json'), 'utf-8')) as {
        npcs: Array<{ components: Array<{ type: string; problemTypes?: string[] }> }>;
    };
    const servedDomains = new Set(
        npcRegistry.npcs.flatMap(npc => npc.components)
            .filter(c => c.type === 'math_challenge')
            .flatMap(c => c.problemTypes ?? []),
    );

    const curriculumPool = JSON.parse(readFileSync(join(DATA_DIR, 'math', 'problems_curriculum.json'), 'utf-8')) as {
        problems: Array<{ domain: string; curriculumStep: number }>;
    };
    const maxStep = new Map<string, number>();
    for (const p of curriculumPool.problems) {
        maxStep.set(p.domain, Math.max(maxStep.get(p.domain) ?? 0, p.curriculumStep));
    }

    for (const domain of servedDomains) {
        if (!source.domains[domain] || source.domains[domain].length === 0) {
            console.error(`  FAIL: grade_expectations.json has no milestones for served domain "${domain}" — decide which Icelandic grade its material belongs to (docs/GRADE_EXPECTATIONS.md) or the parent report cannot place it.`);
            errors++;
        }
    }
    for (const [domain, milestones] of Object.entries(source.domains)) {
        for (const m of milestones) {
            if (m.step > (maxStep.get(domain) ?? 0)) {
                console.error(`  FAIL: grade_expectations.json ${domain} end-of-grade-${m.endOfGrade} milestone is step ${m.step}, but the curriculum pool only authors up to step ${maxStep.get(domain) ?? 0} — no child could ever reach the verdict.`);
                errors++;
            }
            if (!m.covers || !m.basis || !m.source || !sourceIds.has(m.source)) {
                console.error(`  FAIL: grade_expectations.json ${domain} grade-${m.endOfGrade} milestone must carry covers/basis and a source id listed in meta.sources — every claim needs provenance.`);
                errors++;
            }
        }
    }
    validated++;
}
validateGradeExpectations();

// Cross-reference validation
validateCrossReferences();
validateCompiledLevels();

/**
 * The tile contract, checked against the SPEC rather than against the compiler.
 *
 * Compiled-level freshness above re-runs the compiler and compares, so it agrees
 * with whatever the compiler currently does -- including doing it wrong. This
 * derives the runs from the spec independently and asserts the properties a
 * player can see: a run of two or more begins and ends with a cap, decoration
 * never carries collision, and nothing is placed outside the sheet.
 *
 * Worth a guard because the sheet and the compiler are two files that have to
 * agree on the same sixteen numbers, and for a long time they agreed only on
 * three of them.
 */
function validateLevelTileUse(): void {
    console.log('\nLevel tile contract:');

    const specsDir = join(DATA_DIR, 'levels', 'specs');
    const compiledDir = join(DATA_DIR, 'levels', 'compiled');
    if (!existsSync(specsDir) || !existsSync(compiledDir)) {
        console.log('  SKIP: specs or compiled directory missing');
        return;
    }

    const manifest = loadJson(join(DATA_DIR, 'tilesets', 'tileset_manifest.json')) as {
        tilesets: Array<{ key: string; worldSkin?: boolean; tiles: Array<{ index: number; role: string; collides: boolean }> }>;
    };
    const scatterGids = new Set<number>(GID.scatter as unknown as number[]);
    const collidingGids = new Set(COLLIDING_TILE_IDS.map(id => id + 1));

    let checkedRuns = 0;
    let checkedScatter = 0;
    const usedByALevel = new Set<string>();

    for (const file of readdirSync(specsDir).filter(f => f.endsWith('.json'))) {
        const spec = loadJson(join(specsDir, file)) as LevelSpec;
        const compiledPath = join(compiledDir, file.replace('.spec.json', '.json'));
        if (!existsSync(compiledPath)) continue;
        const compiled = loadJson(compiledPath) as {
            width: number;
            layers: Array<{ name: string; type: string; data?: number[] }>;
            tilesets: Array<{ tilecount: number; name?: string }>;
        };
        for (const t of compiled.tilesets) if (t.name) usedByALevel.add(t.name);
        const width = compiled.width;
        const layer = (name: string) => compiled.layers.find(l => l.name === name && l.type === 'tilelayer');
        const ground = layer('ground')?.data;
        const decoration = layer('decoration')?.data;
        if (!ground || !decoration) {
            console.error(`  FAIL: ${file} has no ground or decoration tile layer`);
            errors++;
            continue;
        }
        const tilecount = compiled.tilesets[0]?.tilecount ?? 0;
        const at = (data: number[], x: number, y: number) => data[y * width + x] ?? 0;

        // Every gid placed has to exist in the sheet.
        for (const [name, data] of [['ground', ground], ['decoration', decoration]] as const) {
            for (const gid of data) {
                if (gid !== 0 && (gid < 1 || gid > tilecount)) {
                    console.error(`  FAIL: ${file} ${name} layer places gid ${gid}, outside 1..${tilecount}`);
                    errors++;
                    break;
                }
            }
        }

        // Decoration must never collide, and the ground must never be scatter.
        for (const gid of decoration) {
            if (gid !== 0 && collidingGids.has(gid)) {
                console.error(`  FAIL: ${file} puts colliding gid ${gid} in the decoration layer`);
                errors++;
                break;
            }
        }
        for (const gid of ground) {
            if (scatterGids.has(gid)) {
                console.error(`  FAIL: ${file} puts scatter gid ${gid} in the ground layer`);
                errors++;
                break;
            }
        }

        for (const platform of spec.platforms) {
            const isGround = platform.type === 'ground';
            const last = platform.x + platform.width - 1;
            if (platform.width < 2 || platform.x < 0 || last >= width) continue;
            checkedRuns++;
            const wantLeft = isGround ? GID.groundCapLeft : GID.platformCapLeft;
            const wantRight = isGround ? GID.groundCapRight : GID.platformCapRight;
            const gotLeft = at(ground, platform.x, platform.y);
            const gotRight = at(ground, last, platform.y);
            if (gotLeft !== wantLeft) {
                console.error(`  FAIL: ${file} run at (${platform.x},${platform.y}) w${platform.width} `
                    + `starts with gid ${gotLeft}, expected the left cap ${wantLeft}`);
                errors++;
            }
            if (gotRight !== wantRight) {
                console.error(`  FAIL: ${file} run at (${platform.x},${platform.y}) w${platform.width} `
                    + `ends with gid ${gotRight}, expected the right cap ${wantRight}`);
                errors++;
            }
            // A tuft hanging over the end of a ledge looks like it is falling off.
            for (const x of [platform.x, last]) {
                if (platform.y - 1 >= 0 && at(decoration, x, platform.y - 1) !== 0) {
                    console.error(`  FAIL: ${file} scatters over the capped cell (${x},${platform.y - 1})`);
                    errors++;
                }
            }
        }

        for (let i = 0; i < decoration.length; i++) {
            if (decoration[i] === 0) continue;
            checkedScatter++;
            const x = i % width;
            const y = Math.floor(i / width);
            // Every mark has to be sitting on something.
            if (!collidingGids.has(at(ground, x, y + 1))) {
                console.error(`  FAIL: ${file} scatters at (${x},${y}) with no ground beneath it`);
                errors++;
            }
        }
    }

    // The sheet has to declare everything the compiler places, with the same
    // collision answer. Two files, sixteen numbers, one contract.
    //
    // The exemption is `worldSkin: false`, not a hard-coded key. It used to be
    // `|| tileset.key === 'forest_tiles'`, which is how that sheet came to
    // declare four empty cells as colliding without anything noticing: the
    // manifest handed it the full generated role list, and the one check that
    // would have caught the mismatch had its name written into a skip. A sheet
    // is exempt only by declaring that it cannot dress a world -- and then it
    // has to actually not dress one, which is the next loop.
    for (const tileset of manifest.tilesets) {
        if (tileset.worldSkin === false && usedByALevel.has(tileset.key)) {
            console.error(`  FAIL: ${tileset.key} is declared worldSkin false but a compiled level names it`);
            errors++;
        }
    }
    for (const tileset of manifest.tilesets) {
        if (!tileset.key.endsWith('_tiles') || tileset.worldSkin === false) continue;
        const declared = new Map(tileset.tiles.map(t => [t.index, t]));
        for (const id of COLLIDING_TILE_IDS) {
            const entry = declared.get(id);
            if (!entry) {
                console.error(`  FAIL: ${tileset.key} does not declare tile ${id}, which the compiler places`);
                errors++;
            } else if (!entry.collides) {
                console.error(`  FAIL: ${tileset.key} declares tile ${id} (${entry.role}) as non-colliding, `
                    + 'but the compiler places it in the ground layer');
                errors++;
            }
        }
        for (const gid of GID.scatter as unknown as number[]) {
            const entry = declared.get(gid - 1);
            if (!entry) {
                console.error(`  FAIL: ${tileset.key} does not declare scatter tile ${gid - 1}`);
                errors++;
            } else if (entry.collides) {
                console.error(`  FAIL: ${tileset.key} declares scatter tile ${gid - 1} as colliding`);
                errors++;
            }
        }
    }

    if (errors === 0) {
        console.log(`  OK: ${checkedRuns} capped run(s) and ${checkedScatter} scatter mark(s) `
            + 'match the sheet the generator wrote');
        validated++;
    }
}
validateLevelTileUse();
const materialized = validateMaterializedCurriculum();
validateMathReviewReports(materialized);

// Summary
console.log(`\n${'='.repeat(40)}`);
console.log(`Validated: ${validated} files`);
if (errors > 0) {
    console.error(`Errors: ${errors}`);
    process.exit(1);
} else {
    console.log('All content valid!');
}
