import Phaser from 'phaser';

// Singleton event emitter for cross-scene communication
export const EventBus = new Phaser.Events.EventEmitter();

// Event name constants
export const GameEvents = {
    // Math system
    MATH_CHALLENGE_START: 'math-challenge-start',
    MATH_PROBLEM_PRESENTED: 'math-problem-presented',
    MATH_ANSWER_SUBMITTED: 'math-answer-submitted',
    MATH_CHALLENGE_COMPLETE: 'math-challenge-complete',

    // Player
    PLAYER_DIED: 'player-died',
    ABILITY_GRANTED: 'ability-granted',
    ABILITY_REVOKED: 'ability-revoked',

    // Game state
    COINS_CHANGED: 'coins-changed',
    STARS_CHANGED: 'stars-changed',
    OWL_SAVED: 'owl-saved',
    LEVEL_COMPLETE: 'level-complete',
    SAVE_GAME: 'save-game',

    // XP / Leveling
    XP_CHANGED: 'xp-changed',
    LEVEL_UP: 'level-up',

    // NPC
    NPC_INTERACT: 'npc-interact',
    DIALOG_START: 'dialog-start',
    DIALOG_END: 'dialog-end',
    DIALOG_ADVANCE: 'dialog-advance',
} as const;
