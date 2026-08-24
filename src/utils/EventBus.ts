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
    /** Emitted on level load with how many owls this level holds, so the HUD
     *  can segment the owl ring before the first rescue. */
    LEVEL_OWLS: 'level-owls',
    /** Consecutive correct answers within the current level. */
    STREAK_CHANGED: 'streak-changed',
    LEVEL_COMPLETE: 'level-complete',
    SAVE_GAME: 'save-game',

    // XP / Leveling
    XP_CHANGED: 'xp-changed',
    LEVEL_UP: 'level-up',

    // Settings
    LOCALE_CHANGED: 'locale-changed',

    // NPC
    NPC_INTERACT: 'npc-interact',
    DIALOG_START: 'dialog-start',
    DIALOG_END: 'dialog-end',
    DIALOG_ADVANCE: 'dialog-advance',
} as const;
