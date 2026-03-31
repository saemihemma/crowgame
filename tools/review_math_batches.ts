import { materializeMathBatches, reviewMaterializedMathBatches } from './math_authoring';

function getReviewGateFailures(review: ReturnType<typeof reviewMaterializedMathBatches>): string[] {
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

const materialized = materializeMathBatches();
const review = reviewMaterializedMathBatches(materialized);

console.log(`[math:review] Generated problems: ${review.generatedProblemCount}`);
console.log(`[math:review] Accepted batches: ${review.acceptedBatchCount}/${review.batchReviews.length}`);
console.log(`[math:review] Average accepted grade: ${review.averageAcceptedGrade}`);

for (const batch of review.batchReviews) {
    console.log(
        `[math:review] ${batch.batchId}: grade=${batch.averageGrade} accepted=${batch.accepted} criticalIssues=${batch.criticalIssues.join(',') || 'none'}`,
    );
}

const gateFailures = getReviewGateFailures(review);
if (gateFailures.length > 0) {
    for (const failure of gateFailures) {
        console.error(`[math:review] FAIL: ${failure}`);
    }
    process.exitCode = 1;
}
