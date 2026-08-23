import { readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { deriveCurriculumStep, deriveDifficultyTraits } from './math_curriculum';
import type { MathProblem } from '../math-kernel/utils/Types';

const ROOT = resolve(join(__dirname, '..'));

const TARGET_FILES = [
    join(ROOT, 'public', 'data', 'math', 'problems_easy.json'),
    join(ROOT, 'public', 'data', 'math', 'problems_dataset.json'),
    join(ROOT, 'public', 'data', 'math', 'problems_gaps.json'),
    join(ROOT, 'public', 'data', 'math', 'problems_curriculum.json'),
    join(ROOT, 'authoring', 'math', 'seed', 'problems_curriculum_seed.json'),
];

type ProblemPool = { problems: MathProblem[] };

let updatedProblems = 0;

for (const filePath of TARGET_FILES) {
    const pool = JSON.parse(readFileSync(filePath, 'utf8')) as ProblemPool;
    let touched = false;

    pool.problems = pool.problems.map(problem => {
        const curriculumStep = deriveCurriculumStep(problem);
        const difficultyTraits = deriveDifficultyTraits(problem);

        if (
            problem.curriculumStep !== curriculumStep ||
            JSON.stringify(problem.difficultyTraits ?? null) !== JSON.stringify(difficultyTraits ?? null)
        ) {
            touched = true;
            updatedProblems++;
            return {
                ...problem,
                curriculumStep,
                difficultyTraits,
            };
        }

        return problem;
    });

    if (touched) {
        writeFileSync(filePath, `${JSON.stringify(pool, null, 2)}\n`, 'utf8');
        console.log(`[math:sync-metadata] updated ${filePath}`);
    }
}

console.log(`[math:sync-metadata] updated problems: ${updatedProblems}`);
