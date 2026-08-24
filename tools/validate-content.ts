import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { compileLevel, type LevelSpec } from './level_compiler';
import { deriveCurriculumStep, deriveDifficultyTraits } from './math_curriculum';
import {
    computeInitialProblemELO,
    loadBandTable,
    materializeMathBatches,
    reviewMaterializedMathBatches,
    type MaterializationResult,
} from './math_authoring';
import { buildPromptUniquenessKey, deriveVerifiedDifficultyTraits, evaluateArithmeticPrompt } from './math_verifier';
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

    // Validate level specs reference valid NPCs
    const specsDir = join(DATA_DIR, 'levels', 'specs');
    if (existsSync(specsDir)) {
        for (const file of readdirSync(specsDir).filter(f => f.endsWith('.json'))) {
            const spec = loadJson(join(specsDir, file)) as {
                id: string;
                spawns: { npcs?: Array<{ npc_id: string }> };
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
        }
    }

    // Validate math problems: MCQ options contain correct answer
    const mathDir = join(DATA_DIR, 'math');
    if (existsSync(mathDir)) {
        const problemIds = new Set<string>();
        const promptKeys = new Map<string, string>();
        for (const file of readdirSync(mathDir).filter(f => f.endsWith('.json'))) {
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
}

function validateProblemMetadata(problem: MathProblem, file: string): void {
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
            console.error(`  FAIL: Compiled level drift detected for ${file}. Run npm.cmd run compile.`);
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

    if (JSON.stringify(current) !== JSON.stringify(materialized.curriculumPool)) {
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
    for (const file of readdirSync(mathDir).filter(f => f.endsWith('.json'))) {
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

// Cross-reference validation
validateCrossReferences();
validateCompiledLevels();
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
