import { writeMathAuthoringOutputs } from './math_authoring';

function getReviewGateFailures(review: ReturnType<typeof writeMathAuthoringOutputs>['review']): string[] {
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
    for (const grade of review.runtimeSelectorSmoke.roleGrades) {
        if (grade.grade < 8.5) {
            failures.push(`runtime selector smoke ${grade.role} grade ${grade.grade} < 8.5`);
        }
    }

    for (const batch of review.batchReviews) {
        if (!batch.accepted) {
            failures.push(`${batch.batchId} rejected`);
        }
        const gradeSets = [
            ...batch.templateReview.roleGrades,
            ...batch.concreteReview.roleGrades,
            ...batch.simulationReview.roleGrades,
        ];
        for (const grade of gradeSets) {
            if (grade.grade < 8.5) {
                failures.push(`${batch.batchId} ${grade.role} grade ${grade.grade} < 8.5`);
            }
        }
    }

    return failures;
}

const { materialization, review } = writeMathAuthoringOutputs();

console.log(`[math:materialize] Seed problems: ${materialization.seedProblems.length}`);
console.log(`[math:materialize] Generated problems: ${materialization.generatedProblems.length}`);
console.log(`[math:materialize] Curriculum total: ${materialization.curriculumPool.problems.length}`);
console.log(`[math:materialize] Accepted batches: ${review.acceptedBatchCount}/${review.batchReviews.length}`);

const gateFailures = getReviewGateFailures(review);
if (gateFailures.length > 0) {
    for (const failure of gateFailures) {
        console.error(`[math:materialize] FAIL: ${failure}`);
    }
    process.exitCode = 1;
}
