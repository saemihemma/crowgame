const fs = require('fs');
const path = require('path');

/**
 * Analyze ELO distribution across all problem pools
 */

const EASY_POOL = path.join(__dirname, '..', 'public', 'data', 'math', 'problems_easy.json');
const DATASET_POOL = path.join(__dirname, '..', 'public', 'data', 'math', 'problems_dataset.json');
const GAPS_POOL = path.join(__dirname, '..', 'public', 'data', 'math', 'problems_gaps.json');

function analyzePool(poolPath, poolName) {
    const data = JSON.parse(fs.readFileSync(poolPath, 'utf8'));
    const problems = data.problems;

    const byDomain = {};
    const byELO = {};
    const eloByDomain = {};

    problems.forEach(problem => {
        const elo = Math.round(200 + (problem.difficulty - 1) * 250);
        const domain = problem.domain;

        // Overall counts
        byDomain[domain] = (byDomain[domain] || 0) + 1;
        byELO[elo] = (byELO[elo] || 0) + 1;

        // Per-domain ELO distribution
        if (!eloByDomain[domain]) eloByDomain[domain] = {};
        eloByDomain[domain][elo] = (eloByDomain[domain][elo] || 0) + 1;
    });

    console.log(`\n=== ${poolName} (${problems.length} problems) ===`);

    console.log('\nOverall ELO Distribution:');
    Object.keys(byELO).sort((a, b) => Number(a) - Number(b)).forEach(elo => {
        console.log(`  ELO ${elo}: ${byELO[elo]} problems`);
    });

    console.log('\nBy Domain:');
    Object.keys(byDomain).sort().forEach(domain => {
        console.log(`  ${domain}: ${byDomain[domain]} problems`);
    });

    console.log('\nPer-Domain ELO Distribution:');
    Object.keys(eloByDomain).sort().forEach(domain => {
        console.log(`  ${domain}:`);
        Object.keys(eloByDomain[domain]).sort((a, b) => Number(a) - Number(b)).forEach(elo => {
            console.log(`    ELO ${elo}: ${eloByDomain[domain][elo]} problems`);
        });
    });
}

function findGaps() {
    const easyData = JSON.parse(fs.readFileSync(EASY_POOL, 'utf8'));
    const datasetData = JSON.parse(fs.readFileSync(DATASET_POOL, 'utf8'));
    const gapsData = JSON.parse(fs.readFileSync(GAPS_POOL, 'utf8'));
    const allProblems = [...easyData.problems, ...datasetData.problems, ...gapsData.problems];

    const eloByDomain = {};
    allProblems.forEach(problem => {
        const elo = Math.round(200 + (problem.difficulty - 1) * 250);
        const domain = problem.domain;
        if (!eloByDomain[domain]) eloByDomain[domain] = new Set();
        eloByDomain[domain].add(elo);
    });

    console.log('\n=== GAP ANALYSIS ===');
    Object.keys(eloByDomain).sort().forEach(domain => {
        const elos = Array.from(eloByDomain[domain]).sort((a, b) => a - b);
        const gaps = [];

        for (let i = 0; i < elos.length - 1; i++) {
            const gap = elos[i + 1] - elos[i];
            if (gap > 100) {
                gaps.push(`${elos[i]} → ${elos[i + 1]} (gap: ${gap})`);
            }
        }

        if (gaps.length > 0) {
            console.log(`  ${domain}: ${gaps.join(', ')}`);
        }
    });

    // Check specific user's ELO (587)
    const userELO = 587;
    console.log(`\n=== At User ELO ${userELO} ===`);
    Object.keys(eloByDomain).sort().forEach(domain => {
        const elos = Array.from(eloByDomain[domain]).sort((a, b) => a - b);

        const easierRange = [userELO * 0.91, userELO]; // 60% easier
        const atLevelRange = [userELO, userELO * 1.09]; // 30% at-level
        const challengeRange = [userELO * 1.09, userELO * 1.18]; // 10% challenge

        const inEasier = elos.filter(e => e >= easierRange[0] && e <= easierRange[1]);
        const inAtLevel = elos.filter(e => e >= atLevelRange[0] && e <= atLevelRange[1]);
        const inChallenge = elos.filter(e => e >= challengeRange[0] && e <= challengeRange[1]);

        if (inAtLevel.length === 0 || inChallenge.length === 0) {
            console.log(`  ${domain}:`);
            console.log(`    Easier (534-587): ${inEasier.length > 0 ? inEasier.join(', ') : 'NONE'}`);
            console.log(`    At-level (587-640): ${inAtLevel.length > 0 ? inAtLevel.join(', ') : 'NONE'}`);
            console.log(`    Challenge (640-693): ${inChallenge.length > 0 ? inChallenge.join(', ') : 'NONE'}`);
        }
    });
}

analyzePool(EASY_POOL, 'problems_easy.json');
analyzePool(DATASET_POOL, 'problems_dataset.json');
analyzePool(GAPS_POOL, 'problems_gaps.json');
findGaps();
