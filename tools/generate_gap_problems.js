const fs = require('fs');
const path = require('path');

/**
 * Generate problems_gaps.json from specifications
 * 60 problems distributed across ELO 350-850 to fill gaps
 */

const problems = [
    // ELO 350 (Difficulty 1.6) - 4 problems
    {
        id: "gap_addition_0001",
        domain: "addition",
        skills: ["single_digit_with_carry"],
        difficulty: 1.6,
        ageBand: [5, 6],
        prompt: { text: "6 + 5 = ?", assets: null },
        answer: { mode: "mcq", correct: 11, options: [11, 10, 12, 1] },
        hint: "6 + 4 = 10, then add 1 more!",
        explanation: "6 + 5 = 11",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_addition_0002",
        domain: "addition",
        skills: ["single_digit_with_carry"],
        difficulty: 1.6,
        ageBand: [5, 6],
        prompt: { text: "5 + 7 = ?", assets: null },
        answer: { mode: "mcq", correct: 12, options: [12, 11, 13, 2] },
        hint: "5 + 5 = 10, then add 2 more!",
        explanation: "5 + 7 = 12",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_subtraction_0001",
        domain: "subtraction",
        skills: ["single_digit_subtraction"],
        difficulty: 1.6,
        ageBand: [5, 6],
        prompt: { text: "11 - 4 = ?", assets: null },
        answer: { mode: "mcq", correct: 7, options: [7, 6, 8, 15] },
        hint: "Count back from 11: 10, 9, 8, 7!",
        explanation: "11 - 4 = 7",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_subtraction_0002",
        domain: "subtraction",
        skills: ["single_digit_subtraction"],
        difficulty: 1.6,
        ageBand: [5, 6],
        prompt: { text: "13 - 6 = ?", assets: null },
        answer: { mode: "mcq", correct: 7, options: [7, 6, 8, 19] },
        hint: "13 - 3 = 10, then 10 - 3 = 7!",
        explanation: "13 - 6 = 7",
        misconceptionTags: [],
        generator: null
    },

    // ELO 400 (Difficulty 1.8) - 2 problems
    {
        id: "gap_subtraction_0003",
        domain: "subtraction",
        skills: ["subtraction_with_borrow"],
        difficulty: 1.8,
        ageBand: [5, 6],
        prompt: { text: "12 - 7 = ?", assets: null },
        answer: { mode: "mcq", correct: 5, options: [5, 4, 6, 19] },
        hint: "12 - 2 = 10, then 10 - 5 = 5!",
        explanation: "12 - 7 = 5",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_subtraction_0004",
        domain: "subtraction",
        skills: ["subtraction_with_borrow"],
        difficulty: 1.8,
        ageBand: [5, 6],
        prompt: { text: "13 - 8 = ?", assets: null },
        answer: { mode: "mcq", correct: 5, options: [5, 4, 6, 21] },
        hint: "Count back from 13 carefully!",
        explanation: "13 - 8 = 5",
        misconceptionTags: [],
        generator: null
    },

    // ELO 500 (Difficulty 2.0) - 7 problems
    {
        id: "gap_addition_0003",
        domain: "addition",
        skills: ["addition_with_carry"],
        difficulty: 2.0,
        ageBand: [6, 7],
        prompt: { text: "6 + 9 = ?", assets: null },
        answer: { mode: "mcq", correct: 15, options: [15, 14, 16, 5] },
        hint: "6 + 4 = 10, then add 5 more!",
        explanation: "6 + 9 = 15",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_addition_0004",
        domain: "addition",
        skills: ["addition_with_carry"],
        difficulty: 2.0,
        ageBand: [6, 7],
        prompt: { text: "7 + 8 = ?", assets: null },
        answer: { mode: "mcq", correct: 15, options: [15, 14, 16, 5] },
        hint: "7 + 3 = 10, then add 5 more!",
        explanation: "7 + 8 = 15",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_addition_0005",
        domain: "addition",
        skills: ["addition_with_carry"],
        difficulty: 2.0,
        ageBand: [6, 7],
        prompt: { text: "8 + 9 = ?", assets: null },
        answer: { mode: "mcq", correct: 17, options: [17, 16, 18, 7] },
        hint: "8 + 2 = 10, then add 7 more!",
        explanation: "8 + 9 = 17",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_subtraction_0005",
        domain: "subtraction",
        skills: ["subtraction_with_borrow"],
        difficulty: 2.0,
        ageBand: [6, 7],
        prompt: { text: "16 - 7 = ?", assets: null },
        answer: { mode: "mcq", correct: 9, options: [9, 8, 10, 23] },
        hint: "16 - 6 = 10, then 10 - 1 = 9!",
        explanation: "16 - 7 = 9",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_subtraction_0006",
        domain: "subtraction",
        skills: ["subtraction_with_borrow"],
        difficulty: 2.0,
        ageBand: [6, 7],
        prompt: { text: "17 - 9 = ?", assets: null },
        answer: { mode: "mcq", correct: 8, options: [8, 7, 9, 26] },
        hint: "Count back from 17!",
        explanation: "17 - 9 = 8",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_multiplication_0001",
        domain: "multiplication",
        skills: ["multiplication_tables"],
        difficulty: 2.0,
        ageBand: [6, 7],
        prompt: { text: "2 × 6 = ?", assets: null },
        answer: { mode: "mcq", correct: 12, options: [12, 11, 13, 8] },
        hint: "Count by 2s: 2, 4, 6, 8, 10, 12!",
        explanation: "2 × 6 = 12",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_multiplication_0002",
        domain: "multiplication",
        skills: ["multiplication_tables"],
        difficulty: 2.0,
        ageBand: [6, 7],
        prompt: { text: "2 × 7 = ?", assets: null },
        answer: { mode: "mcq", correct: 14, options: [14, 13, 15, 9] },
        hint: "2 groups of 7 makes...",
        explanation: "2 × 7 = 14",
        misconceptionTags: [],
        generator: null
    },

    // ELO 575 (Difficulty 2.5) - 7 problems [PRIORITY]
    {
        id: "gap_addition_0006",
        domain: "addition",
        skills: ["teens_addition"],
        difficulty: 2.5,
        ageBand: [6, 7],
        prompt: { text: "13 + 9 = ?", assets: null },
        answer: { mode: "mcq", correct: 22, options: [22, 21, 23, 12] },
        hint: "13 + 7 = 20, then add 2 more!",
        explanation: "13 + 9 = 22",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_addition_0007",
        domain: "addition",
        skills: ["teens_addition"],
        difficulty: 2.5,
        ageBand: [6, 7],
        prompt: { text: "14 + 8 = ?", assets: null },
        answer: { mode: "mcq", correct: 22, options: [22, 21, 23, 12] },
        hint: "14 + 6 = 20, then add 2 more!",
        explanation: "14 + 8 = 22",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_addition_0008",
        domain: "addition",
        skills: ["teens_addition"],
        difficulty: 2.5,
        ageBand: [6, 7],
        prompt: { text: "16 + 7 = ?", assets: null },
        answer: { mode: "mcq", correct: 23, options: [23, 22, 24, 13] },
        hint: "16 + 4 = 20, then add 3 more!",
        explanation: "16 + 7 = 23",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_addition_0009",
        domain: "addition",
        skills: ["teens_addition"],
        difficulty: 2.5,
        ageBand: [6, 7],
        prompt: { text: "17 + 8 = ?", assets: null },
        answer: { mode: "mcq", correct: 25, options: [25, 24, 26, 15] },
        hint: "17 + 3 = 20, then add 5 more!",
        explanation: "17 + 8 = 25",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_subtraction_0007",
        domain: "subtraction",
        skills: ["teens_subtraction"],
        difficulty: 2.5,
        ageBand: [6, 7],
        prompt: { text: "22 - 8 = ?", assets: null },
        answer: { mode: "mcq", correct: 14, options: [14, 13, 15, 30] },
        hint: "22 - 2 = 20, then 20 - 6 = 14!",
        explanation: "22 - 8 = 14",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_subtraction_0008",
        domain: "subtraction",
        skills: ["teens_subtraction"],
        difficulty: 2.5,
        ageBand: [6, 7],
        prompt: { text: "21 - 7 = ?", assets: null },
        answer: { mode: "mcq", correct: 14, options: [14, 13, 15, 28] },
        hint: "21 - 1 = 20, then 20 - 6 = 14!",
        explanation: "21 - 7 = 14",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_subtraction_0009",
        domain: "subtraction",
        skills: ["teens_subtraction"],
        difficulty: 2.5,
        ageBand: [6, 7],
        prompt: { text: "23 - 9 = ?", assets: null },
        answer: { mode: "mcq", correct: 14, options: [14, 13, 15, 32] },
        hint: "23 - 3 = 20, then 20 - 6 = 14!",
        explanation: "23 - 9 = 14",
        misconceptionTags: [],
        generator: null
    },

    // ELO 600 (Difficulty 2.6) - 7 problems [PRIORITY]
    {
        id: "gap_addition_0010",
        domain: "addition",
        skills: ["teens_addition"],
        difficulty: 2.6,
        ageBand: [6, 7],
        prompt: { text: "15 + 9 = ?", assets: null },
        answer: { mode: "mcq", correct: 24, options: [24, 23, 25, 14] },
        hint: "15 + 5 = 20, then add 4 more!",
        explanation: "15 + 9 = 24",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_addition_0011",
        domain: "addition",
        skills: ["teens_addition"],
        difficulty: 2.6,
        ageBand: [6, 7],
        prompt: { text: "18 + 8 = ?", assets: null },
        answer: { mode: "mcq", correct: 26, options: [26, 25, 27, 16] },
        hint: "18 + 2 = 20, then add 6 more!",
        explanation: "18 + 8 = 26",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_addition_0012",
        domain: "addition",
        skills: ["teens_addition"],
        difficulty: 2.6,
        ageBand: [6, 7],
        prompt: { text: "19 + 7 = ?", assets: null },
        answer: { mode: "mcq", correct: 26, options: [26, 25, 27, 16] },
        hint: "19 + 1 = 20, then add 6 more!",
        explanation: "19 + 7 = 26",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_subtraction_0010",
        domain: "subtraction",
        skills: ["teens_subtraction"],
        difficulty: 2.6,
        ageBand: [6, 7],
        prompt: { text: "24 - 9 = ?", assets: null },
        answer: { mode: "mcq", correct: 15, options: [15, 14, 16, 33] },
        hint: "24 - 4 = 20, then 20 - 5 = 15!",
        explanation: "24 - 9 = 15",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_subtraction_0011",
        domain: "subtraction",
        skills: ["teens_subtraction"],
        difficulty: 2.6,
        ageBand: [6, 7],
        prompt: { text: "25 - 8 = ?", assets: null },
        answer: { mode: "mcq", correct: 17, options: [17, 16, 18, 33] },
        hint: "25 - 5 = 20, then 20 - 3 = 17!",
        explanation: "25 - 8 = 17",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_multiplication_0003",
        domain: "multiplication",
        skills: ["multiplication_tables"],
        difficulty: 2.6,
        ageBand: [6, 7],
        prompt: { text: "3 × 6 = ?", assets: null },
        answer: { mode: "mcq", correct: 18, options: [18, 17, 19, 9] },
        hint: "Count by 3s: 3, 6, 9, 12, 15, 18!",
        explanation: "3 × 6 = 18",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_multiplication_0004",
        domain: "multiplication",
        skills: ["multiplication_tables"],
        difficulty: 2.6,
        ageBand: [6, 7],
        prompt: { text: "3 × 7 = ?", assets: null },
        answer: { mode: "mcq", correct: 21, options: [21, 20, 22, 10] },
        hint: "3 + 3 + 3 + 3 + 3 + 3 + 3 = ?",
        explanation: "3 × 7 = 21",
        misconceptionTags: [],
        generator: null
    },

    // ELO 650 (Difficulty 2.8) - 10 problems [PRIORITY]
    {
        id: "gap_addition_0013",
        domain: "addition",
        skills: ["two_digit_addition"],
        difficulty: 2.8,
        ageBand: [7, 8],
        prompt: { text: "21 + 18 = ?", assets: null },
        answer: { mode: "mcq", correct: 39, options: [39, 38, 40, 49] },
        hint: "20 + 18 = 38, then add 1 more!",
        explanation: "21 + 18 = 39",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_addition_0014",
        domain: "addition",
        skills: ["two_digit_addition"],
        difficulty: 2.8,
        ageBand: [7, 8],
        prompt: { text: "24 + 17 = ?", assets: null },
        answer: { mode: "mcq", correct: 41, options: [41, 40, 42, 51] },
        hint: "24 + 16 = 40, then add 1 more!",
        explanation: "24 + 17 = 41",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_addition_0015",
        domain: "addition",
        skills: ["two_digit_addition"],
        difficulty: 2.8,
        ageBand: [7, 8],
        prompt: { text: "28 + 16 = ?", assets: null },
        answer: { mode: "mcq", correct: 44, options: [44, 43, 45, 54] },
        hint: "28 + 12 = 40, then add 4 more!",
        explanation: "28 + 16 = 44",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_addition_0016",
        domain: "addition",
        skills: ["two_digit_addition"],
        difficulty: 2.8,
        ageBand: [7, 8],
        prompt: { text: "19 + 22 = ?", assets: null },
        answer: { mode: "mcq", correct: 41, options: [41, 40, 42, 31] },
        hint: "19 + 21 = 40, then add 1 more!",
        explanation: "19 + 22 = 41",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_subtraction_0012",
        domain: "subtraction",
        skills: ["two_digit_subtraction"],
        difficulty: 2.8,
        ageBand: [7, 8],
        prompt: { text: "35 - 18 = ?", assets: null },
        answer: { mode: "mcq", correct: 17, options: [17, 16, 18, 53] },
        hint: "35 - 15 = 20, then 20 - 3 = 17!",
        explanation: "35 - 18 = 17",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_subtraction_0013",
        domain: "subtraction",
        skills: ["two_digit_subtraction"],
        difficulty: 2.8,
        ageBand: [7, 8],
        prompt: { text: "42 - 17 = ?", assets: null },
        answer: { mode: "mcq", correct: 25, options: [25, 24, 26, 59] },
        hint: "42 - 12 = 30, then 30 - 5 = 25!",
        explanation: "42 - 17 = 25",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_subtraction_0014",
        domain: "subtraction",
        skills: ["two_digit_subtraction"],
        difficulty: 2.8,
        ageBand: [7, 8],
        prompt: { text: "38 - 19 = ?", assets: null },
        answer: { mode: "mcq", correct: 19, options: [19, 18, 20, 57] },
        hint: "38 - 18 = 20, then 20 - 1 = 19!",
        explanation: "38 - 19 = 19",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_multiplication_0005",
        domain: "multiplication",
        skills: ["multiplication_tables"],
        difficulty: 2.8,
        ageBand: [7, 8],
        prompt: { text: "4 × 6 = ?", assets: null },
        answer: { mode: "mcq", correct: 24, options: [24, 23, 25, 10] },
        hint: "4 + 4 + 4 + 4 + 4 + 4 = ?",
        explanation: "4 × 6 = 24",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_multiplication_0006",
        domain: "multiplication",
        skills: ["multiplication_tables"],
        difficulty: 2.8,
        ageBand: [7, 8],
        prompt: { text: "4 × 7 = ?", assets: null },
        answer: { mode: "mcq", correct: 28, options: [28, 27, 29, 11] },
        hint: "Count by 4s: 4, 8, 12, 16, 20, 24, 28!",
        explanation: "4 × 7 = 28",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_division_0001",
        domain: "division",
        skills: ["simple_division"],
        difficulty: 2.8,
        ageBand: [7, 8],
        prompt: { text: "24 ÷ 6 = ?", assets: null },
        answer: { mode: "mcq", correct: 4, options: [4, 3, 5, 30] },
        hint: "How many 6s fit into 24?",
        explanation: "24 ÷ 6 = 4",
        misconceptionTags: [],
        generator: null
    },

    // ELO 725 (Difficulty 2.9) - 9 problems
    {
        id: "gap_addition_0017",
        domain: "addition",
        skills: ["two_digit_addition"],
        difficulty: 2.9,
        ageBand: [7, 8],
        prompt: { text: "37 + 28 = ?", assets: null },
        answer: { mode: "mcq", correct: 65, options: [65, 64, 66, 55] },
        hint: "30 + 28 = 58, then add 7 more!",
        explanation: "37 + 28 = 65",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_addition_0018",
        domain: "addition",
        skills: ["two_digit_addition"],
        difficulty: 2.9,
        ageBand: [7, 8],
        prompt: { text: "46 + 39 = ?", assets: null },
        answer: { mode: "mcq", correct: 85, options: [85, 84, 86, 75] },
        hint: "46 + 40 = 86, then subtract 1!",
        explanation: "46 + 39 = 85",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_addition_0019",
        domain: "addition",
        skills: ["two_digit_addition"],
        difficulty: 2.9,
        ageBand: [7, 8],
        prompt: { text: "58 + 27 = ?", assets: null },
        answer: { mode: "mcq", correct: 85, options: [85, 84, 86, 75] },
        hint: "58 + 22 = 80, then add 5 more!",
        explanation: "58 + 27 = 85",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_subtraction_0015",
        domain: "subtraction",
        skills: ["two_digit_subtraction"],
        difficulty: 2.9,
        ageBand: [7, 8],
        prompt: { text: "52 - 28 = ?", assets: null },
        answer: { mode: "mcq", correct: 24, options: [24, 23, 25, 80] },
        hint: "52 - 22 = 30, then 30 - 6 = 24!",
        explanation: "52 - 28 = 24",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_subtraction_0016",
        domain: "subtraction",
        skills: ["two_digit_subtraction"],
        difficulty: 2.9,
        ageBand: [7, 8],
        prompt: { text: "64 - 37 = ?", assets: null },
        answer: { mode: "mcq", correct: 27, options: [27, 26, 28, 101] },
        hint: "64 - 34 = 30, then 30 - 3 = 27!",
        explanation: "64 - 37 = 27",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_multiplication_0007",
        domain: "multiplication",
        skills: ["multiplication_tables"],
        difficulty: 2.9,
        ageBand: [7, 8],
        prompt: { text: "5 × 6 = ?", assets: null },
        answer: { mode: "mcq", correct: 30, options: [30, 29, 31, 11] },
        hint: "Count by 5s: 5, 10, 15, 20, 25, 30!",
        explanation: "5 × 6 = 30",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_multiplication_0008",
        domain: "multiplication",
        skills: ["multiplication_tables"],
        difficulty: 2.9,
        ageBand: [7, 8],
        prompt: { text: "5 × 7 = ?", assets: null },
        answer: { mode: "mcq", correct: 35, options: [35, 34, 36, 12] },
        hint: "5 × 6 = 30, then add 5 more!",
        explanation: "5 × 7 = 35",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_division_0002",
        domain: "division",
        skills: ["simple_division"],
        difficulty: 2.9,
        ageBand: [7, 8],
        prompt: { text: "30 ÷ 6 = ?", assets: null },
        answer: { mode: "mcq", correct: 5, options: [5, 4, 6, 36] },
        hint: "How many 6s make 30?",
        explanation: "30 ÷ 6 = 5",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_division_0003",
        domain: "division",
        skills: ["simple_division"],
        difficulty: 2.9,
        ageBand: [7, 8],
        prompt: { text: "35 ÷ 7 = ?", assets: null },
        answer: { mode: "mcq", correct: 5, options: [5, 4, 6, 42] },
        hint: "Count by 7s until you reach 35!",
        explanation: "35 ÷ 7 = 5",
        misconceptionTags: [],
        generator: null
    },

    // ELO 750 (Difficulty 3.0) - 8 problems
    {
        id: "gap_addition_0020",
        domain: "addition",
        skills: ["two_digit_addition"],
        difficulty: 3.0,
        ageBand: [7, 8],
        prompt: { text: "48 + 37 = ?", assets: null },
        answer: { mode: "mcq", correct: 85, options: [85, 84, 86, 75] },
        hint: "48 + 32 = 80, then add 5 more!",
        explanation: "48 + 37 = 85",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_addition_0021",
        domain: "addition",
        skills: ["two_digit_addition"],
        difficulty: 3.0,
        ageBand: [7, 8],
        prompt: { text: "59 + 35 = ?", assets: null },
        answer: { mode: "mcq", correct: 94, options: [94, 93, 95, 84] },
        hint: "59 + 31 = 90, then add 4 more!",
        explanation: "59 + 35 = 94",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_subtraction_0017",
        domain: "subtraction",
        skills: ["two_digit_subtraction"],
        difficulty: 3.0,
        ageBand: [7, 8],
        prompt: { text: "73 - 48 = ?", assets: null },
        answer: { mode: "mcq", correct: 25, options: [25, 24, 26, 121] },
        hint: "73 - 43 = 30, then 30 - 5 = 25!",
        explanation: "73 - 48 = 25",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_subtraction_0018",
        domain: "subtraction",
        skills: ["two_digit_subtraction"],
        difficulty: 3.0,
        ageBand: [7, 8],
        prompt: { text: "85 - 47 = ?", assets: null },
        answer: { mode: "mcq", correct: 38, options: [38, 37, 39, 132] },
        hint: "85 - 45 = 40, then 40 - 2 = 38!",
        explanation: "85 - 47 = 38",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_multiplication_0009",
        domain: "multiplication",
        skills: ["multiplication_tables"],
        difficulty: 3.0,
        ageBand: [7, 8],
        prompt: { text: "6 × 6 = ?", assets: null },
        answer: { mode: "mcq", correct: 36, options: [36, 35, 37, 12] },
        hint: "6 + 6 + 6 + 6 + 6 + 6 = ?",
        explanation: "6 × 6 = 36",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_multiplication_0010",
        domain: "multiplication",
        skills: ["multiplication_tables"],
        difficulty: 3.0,
        ageBand: [7, 8],
        prompt: { text: "6 × 7 = ?", assets: null },
        answer: { mode: "mcq", correct: 42, options: [42, 41, 43, 13] },
        hint: "6 × 6 = 36, then add 6 more!",
        explanation: "6 × 7 = 42",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_division_0004",
        domain: "division",
        skills: ["simple_division"],
        difficulty: 3.0,
        ageBand: [7, 8],
        prompt: { text: "36 ÷ 6 = ?", assets: null },
        answer: { mode: "mcq", correct: 6, options: [6, 5, 7, 42] },
        hint: "How many 6s fit into 36?",
        explanation: "36 ÷ 6 = 6",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_division_0005",
        domain: "division",
        skills: ["simple_division"],
        difficulty: 3.0,
        ageBand: [7, 8],
        prompt: { text: "42 ÷ 6 = ?", assets: null },
        answer: { mode: "mcq", correct: 7, options: [7, 6, 8, 48] },
        hint: "Count by 6s until you reach 42!",
        explanation: "42 ÷ 6 = 7",
        misconceptionTags: [],
        generator: null
    },

    // ELO 825 (Difficulty 3.3) - 6 problems
    {
        id: "gap_addition_0022",
        domain: "addition",
        skills: ["two_digit_addition"],
        difficulty: 3.3,
        ageBand: [7, 8],
        prompt: { text: "67 + 58 = ?", assets: null },
        answer: { mode: "mcq", correct: 125, options: [125, 124, 126, 115] },
        hint: "67 + 53 = 120, then add 5 more!",
        explanation: "67 + 58 = 125",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_addition_0023",
        domain: "addition",
        skills: ["two_digit_addition"],
        difficulty: 3.3,
        ageBand: [7, 8],
        prompt: { text: "79 + 46 = ?", assets: null },
        answer: { mode: "mcq", correct: 125, options: [125, 124, 126, 115] },
        hint: "79 + 21 = 100, then add 25 more!",
        explanation: "79 + 46 = 125",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_subtraction_0019",
        domain: "subtraction",
        skills: ["two_digit_subtraction"],
        difficulty: 3.3,
        ageBand: [7, 8],
        prompt: { text: "92 - 58 = ?", assets: null },
        answer: { mode: "mcq", correct: 34, options: [34, 33, 35, 150] },
        hint: "92 - 52 = 40, then 40 - 6 = 34!",
        explanation: "92 - 58 = 34",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_subtraction_0020",
        domain: "subtraction",
        skills: ["two_digit_subtraction"],
        difficulty: 3.3,
        ageBand: [7, 8],
        prompt: { text: "83 - 67 = ?", assets: null },
        answer: { mode: "mcq", correct: 16, options: [16, 15, 17, 150] },
        hint: "83 - 63 = 20, then 20 - 4 = 16!",
        explanation: "83 - 67 = 16",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_multiplication_0011",
        domain: "multiplication",
        skills: ["multiplication_tables"],
        difficulty: 3.3,
        ageBand: [7, 8],
        prompt: { text: "7 × 6 = ?", assets: null },
        answer: { mode: "mcq", correct: 42, options: [42, 41, 43, 13] },
        hint: "Count by 7s: 7, 14, 21, 28, 35, 42!",
        explanation: "7 × 6 = 42",
        misconceptionTags: [],
        generator: null
    },
    {
        id: "gap_multiplication_0012",
        domain: "multiplication",
        skills: ["multiplication_tables"],
        difficulty: 3.3,
        ageBand: [7, 8],
        prompt: { text: "8 × 6 = ?", assets: null },
        answer: { mode: "mcq", correct: 48, options: [48, 47, 49, 14] },
        hint: "8 + 8 + 8 + 8 + 8 + 8 = ?",
        explanation: "8 × 6 = 48",
        misconceptionTags: [],
        generator: null
    }
];

const output = { problems };
const outputPath = path.join(__dirname, '..', 'public', 'data', 'math', 'problems_gaps.json');

fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
console.log(`✓ Generated ${problems.length} problems → ${outputPath}`);

// Print summary
const byELO = {};
const byDomain = {};
problems.forEach(p => {
    const elo = Math.round(200 + (p.difficulty - 1) * 250);
    byELO[elo] = (byELO[elo] || 0) + 1;
    byDomain[p.domain] = (byDomain[p.domain] || 0) + 1;
});

console.log('\nDistribution by ELO:');
Object.keys(byELO).sort((a, b) => Number(a) - Number(b)).forEach(elo => {
    console.log(`  ELO ${elo}: ${byELO[elo]} problems`);
});

console.log('\nDistribution by Domain:');
Object.keys(byDomain).sort().forEach(domain => {
    console.log(`  ${domain}: ${byDomain[domain]} problems`);
});
