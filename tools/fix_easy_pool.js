const fs = require('fs');
const path = require('path');

/**
 * Fix problems_easy.json to use fractional difficulties
 *
 * Usage: node tools/fix_easy_pool.js
 */

const EASY_POOL_PATH = path.join(__dirname, '..', 'godot', 'data', 'math', 'problems_easy.json');

// Mapping from problem IDs to new difficulty values
const DIFFICULTY_MAPPING = {
    // Difficulty 1.2 (ELO 250): simplest - 3 problems
    'add_001': 1.2,
    'sub_001': 1.2,
    'count_001': 1.2,

    // Difficulty 1.5 (ELO 325): easy - 3 problems
    'add_002': 1.5,
    'add_003': 1.5,
    'sub_002': 1.5,

    // Difficulty 1.8 (ELO 400): medium-easy - 3 problems
    'add_004': 1.8,
    'count_002': 1.8,
    'comp_001': 1.8,

    // Difficulty 2.1 (ELO 475): medium - 2 problems
    'comp_002': 2.1,
    'seq_001': 2.1,

    // Difficulty 2.4 (ELO 550): medium-hard - 2 problems
    'add_005': 2.4,
    'sub_003': 2.4,

    // Difficulty 2.7 (ELO 625): hard - 2 problems
    'pat_001': 2.7,
    'pat_002': 2.7,
};

function main() {
    console.log('Reading problems_easy.json...');
    const data = JSON.parse(fs.readFileSync(EASY_POOL_PATH, 'utf8'));

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

    console.log('\nWriting updated file...');
    fs.writeFileSync(EASY_POOL_PATH, JSON.stringify(data, null, 2));

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
