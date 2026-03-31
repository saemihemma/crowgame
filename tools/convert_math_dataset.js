const fs = require('fs');
const path = require('path');

/**
 * Convert MathDataset-ElementarySchool to game format
 *
 * Usage: node tools/convert_math_dataset.js <input.json> <output.json>
 */

// Map problem complexity to ELO difficulty
function estimateELO(question, answer) {
    const numbers = question.match(/\d+/g)?.map(Number) || [];

    // Simple heuristics for age 5-8 (ELO 200-800)
    const maxNum = Math.max(...numbers, answer);
    const hasCarry = question.includes('+') && answer > 10;
    const hasBorrow = question.includes('-') && numbers[0] < 20;
    const isMul = question.includes('×') || question.includes('*');
    const isDiv = question.includes('÷') || question.includes('/');

    // ELO 200-400 (Ages 5-6): Single digit, no carry
    if (maxNum <= 10 && !hasCarry && !isMul && !isDiv) return 300;

    // ELO 400-600 (Ages 6-7): Single digit with carry, or small two-digit
    if (maxNum <= 20 && (hasCarry || hasBorrow)) return 500;

    // ELO 600-800 (Ages 7-8): Two-digit arithmetic, simple mul/div
    if (maxNum <= 100 || (isMul && maxNum <= 50)) return 700;

    // Above age 8 (skip for now)
    return 900;
}

function inferDomain(question) {
    if (question.includes('+')) return 'addition';
    if (question.includes('-')) return 'subtraction';
    if (question.includes('×') || question.includes('*')) return 'multiplication';
    if (question.includes('÷') || question.includes('/')) return 'division';
    return 'counting';
}

function generateDistractors(correctAnswer, question) {
    const distractors = new Set();

    // Off-by-one
    distractors.add(correctAnswer - 1);
    distractors.add(correctAnswer + 1);

    // Off-by-ten (place value error)
    distractors.add(correctAnswer - 10);
    distractors.add(correctAnswer + 10);

    // Operation reversal (if applicable)
    const numbers = question.match(/\d+/g)?.map(Number) || [];
    if (numbers.length === 2) {
        const [a, b] = numbers;
        if (question.includes('+')) distractors.add(a - b);
        if (question.includes('-')) distractors.add(a + b);
    }

    // Filter valid distractors (positive, not correct)
    const valid = Array.from(distractors)
        .filter(d => d > 0 && d !== correctAnswer)
        .slice(0, 3);

    // Pad if needed
    while (valid.length < 3) {
        const random = correctAnswer + Math.floor(Math.random() * 10) - 5;
        if (random > 0 && random !== correctAnswer && !valid.includes(random)) {
            valid.push(random);
        }
    }

    return valid;
}

function isAgeAppropriate(question, answer, subcategory) {
    // Filter out advanced subcategories
    const bannedCategories = [
        'gcd', 'lcm', 'conversion', 'time', 'place_value',
        'round_number', 'div_remainder', 'sequence_next_term',
        'add_sub_multiple', 'mul_div_multiple', 'arithmetic_mixed'
    ];

    if (bannedCategories.includes(subcategory)) {
        return false;
    }

    // Must be integer answer
    if (!Number.isInteger(answer)) {
        return false;
    }

    // No negative answers
    if (answer < 0) {
        return false;
    }

    // No very large numbers (above 100 for now)
    if (answer > 100) {
        return false;
    }

    // Extract all numbers from question
    const numbers = question.match(/\d+/g)?.map(Number) || [];

    // No negative numbers in question
    if (question.includes('-') && question.match(/-\d+/)) {
        return false;
    }

    // All operands should be small positive integers
    if (numbers.some(n => n > 100 || n < 0)) {
        return false;
    }

    // No decimals in question
    if (question.includes('.') && question.match(/\d+\.\d+/)) {
        return false;
    }

    // No parentheses (complex operations)
    if (question.includes('(') || question.includes(')')) {
        return false;
    }

    // No exponents
    if (question.includes('^')) {
        return false;
    }

    // No word problems (questions starting with capital letters or "What/How/Calculate")
    if (/^[A-Z]/.test(question) || question.startsWith('What') || question.startsWith('How') || question.startsWith('Calculate')) {
        return false;
    }

    return true;
}

function convertProblem(datasetProblem, index) {
    const { question, answer, subcategory } = datasetProblem;

    // Filter for age-appropriateness first
    if (!isAgeAppropriate(question, answer, subcategory)) {
        return null;
    }

    const elo = estimateELO(question, answer);
    const domain = inferDomain(question);

    // Filter out problems above age 8 (ELO 800+)
    if (elo > 800) return null;

    const distractors = generateDistractors(answer, question);
    const options = [answer, ...distractors].sort(() => Math.random() - 0.5);

    return {
        id: `ext_${domain}_${String(index).padStart(4, '0')}`,
        domain,
        skills: [subcategory || 'arithmetic'],
        difficulty: Math.ceil((elo - 200) / 200), // 1-5 scale
        ageBand: elo < 400 ? [5, 6] : elo < 600 ? [6, 7] : [7, 8],
        prompt: {
            text: `${question} = ?`,
            assets: null
        },
        answer: {
            mode: 'mcq',
            correct: answer,
            options
        },
        hint: `Think carefully about ${question}`,
        explanation: `${question} = ${answer}`,
        misconceptionTags: [],
        generator: null
    };
}

function main() {
    const args = process.argv.slice(2);
    if (args.length !== 2) {
        console.error('Usage: node convert_math_dataset.js <input.json> <output.json>');
        process.exit(1);
    }

    const [inputPath, outputPath] = args;

    console.log(`Reading dataset from ${inputPath}...`);
    const dataset = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

    console.log(`Converting ${dataset.length} problems...`);
    const converted = dataset
        .map((problem, idx) => convertProblem(problem, idx))
        .filter(p => p !== null);  // Filter out problems above age 8

    console.log(`Writing ${converted.length} converted problems to ${outputPath}...`);
    fs.writeFileSync(outputPath, JSON.stringify(converted, null, 2));

    // Stats
    const byDomain = {};
    const byDifficulty = {};
    converted.forEach(p => {
        byDomain[p.domain] = (byDomain[p.domain] || 0) + 1;
        byDifficulty[p.difficulty] = (byDifficulty[p.difficulty] || 0) + 1;
    });

    console.log('\nConversion complete!');
    console.log('\nBy Domain:', byDomain);
    console.log('By Difficulty:', byDifficulty);
}

main();
