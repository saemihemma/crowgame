const fs = require('fs');
const path = require('path');

/**
 * Redistribute problem difficulties to spread across ELO spectrum
 *
 * Usage: node tools/redistribute_difficulties.js
 */

const DATASET_PATH = path.join(__dirname, '..', 'public', 'data', 'math', 'problems_dataset.json');

// Mapping from problem IDs to new difficulty values (from plan)
const DIFFICULTY_MAPPING = {
    // Difficulty 1.2 (ELO 250): 5 problems - simplest
    'ext_addition_0001': 1.2,    // 2+3
    'ext_addition_0005': 1.2,    // 2+2
    'ext_subtraction_0001': 1.2, // 5-2
    'ext_counting_0001': 1.2,    // What comes after 7?
    'ext_counting_0002': 1.2,    // What comes before 10?

    // Difficulty 1.5 (ELO 325): 5 problems - easy single-digit
    'ext_addition_0002': 1.5,    // 4+5
    'ext_addition_0003': 1.5,    // 1+6
    'ext_addition_0004': 1.5,    // 3+4
    'ext_subtraction_0002': 1.5, // 8-3
    'ext_subtraction_0003': 1.5, // 9-4

    // Difficulty 1.8 (ELO 400): 4 problems - near-carry
    'ext_comparison_0001': 1.8,
    'ext_comparison_0002': 1.8,
    'ext_multiplication_0001': 1.8, // 2×3
    'ext_division_0001': 1.8,       // 6÷2

    // Difficulty 2.1 (ELO 475): 5 problems - carry start
    'ext_addition_0006': 2.1,    // 7+5
    'ext_subtraction_0004': 2.1, // 12-5
    'ext_multiplication_0002': 2.1, // 2×5
    'ext_multiplication_0003': 2.1, // 5×2
    'ext_division_0002': 2.1,       // 10÷2

    // Difficulty 2.4 (ELO 550): 5 problems - full carry
    'ext_addition_0007': 2.4,    // 8+6
    'ext_addition_0008': 2.4,    // 9+7
    'ext_addition_0009': 2.4,    // 6+8
    'ext_subtraction_0005': 2.4, // 14-8
    'ext_subtraction_0006': 2.4, // 15-7

    // Difficulty 2.7 (ELO 625): 5 problems - teens
    'ext_pattern_0001': 2.7,
    'ext_pattern_0002': 2.7,
    'ext_sequence_0001': 2.7,
    'ext_sequence_0002': 2.7,
    'ext_multiplication_0004': 2.7, // 3×4

    // Difficulty 3.0 (ELO 700): 6 problems - two-digit
    'ext_addition_0010': 3.0,    // 23+15
    'ext_addition_0011': 3.0,    // 34+22
    'ext_addition_0012': 3.0,    // 45+31
    'ext_subtraction_0007': 3.0, // 48-23
    'ext_subtraction_0008': 3.0, // 56-34
    'ext_subtraction_0009': 3.0, // 67-42

    // Difficulty 3.3 (ELO 775): 5 problems - harder two-digit
    'ext_multiplication_0005': 3.3, // 4×3
    'ext_multiplication_0006': 3.3, // 3×5
    'ext_multiplication_0007': 3.3, // 6×3
    'ext_division_0003': 3.3,       // 12÷3
    'ext_division_0004': 3.3,       // 15÷3
};

function main() {
    console.log('Reading dataset...');
    const data = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8'));

    let updatedCount = 0;
    let unmappedCount = 0;

    console.log('Updating difficulty values...');
    data.problems.forEach(problem => {
        if (DIFFICULTY_MAPPING[problem.id] !== undefined) {
            const oldDifficulty = problem.difficulty;
            problem.difficulty = DIFFICULTY_MAPPING[problem.id];
            console.log(`  ${problem.id}: ${oldDifficulty} → ${problem.difficulty}`);
            updatedCount++;
        } else {
            console.warn(`  WARNING: No mapping for ${problem.id} (keeping difficulty ${problem.difficulty})`);
            unmappedCount++;
        }
    });

    console.log('\nWriting updated dataset...');
    fs.writeFileSync(DATASET_PATH, JSON.stringify(data, null, 2));

    console.log(`\nDone!`);
    console.log(`  Updated: ${updatedCount} problems`);
    console.log(`  Unmapped: ${unmappedCount} problems`);

    // Print ELO distribution
    const eloDistribution = {};
    data.problems.forEach(problem => {
        // Calculate ELO using same formula as ProblemPoolManager
        const elo = Math.round(200 + (problem.difficulty - 1) * 250);
        const eloBand = Math.floor(elo / 50) * 50; // Round to nearest 50
        eloDistribution[eloBand] = (eloDistribution[eloBand] || 0) + 1;
    });

    console.log('\nELO Distribution:');
    Object.keys(eloDistribution).sort((a, b) => Number(a) - Number(b)).forEach(elo => {
        console.log(`  ELO ${elo}: ${eloDistribution[elo]} problems`);
    });
}

main();
