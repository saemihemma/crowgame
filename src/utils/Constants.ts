// Game canvas dimensions (pixel art base resolution optimized for crisp 2x on 1080p desktop)
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

// Tile and sprite sizes
export const TILE_SIZE = 32;
export const SPRITE_SIZE = 64;

// Physics defaults (overridden by PlayerTuning JSON at runtime)
export const DEFAULT_GRAVITY = 800;

// Scene keys
export const SCENES = {
    BOOT: 'BootScene',
    LOGIN: 'LoginScene',
    MAIN_MENU: 'MainMenuScene',
    LEVEL_SELECT: 'LevelSelectScene',
    GAME: 'GameScene',
    HUD: 'HUDScene',
    MATH_CHALLENGE: 'MathChallengeScene',
    PAUSE: 'PauseScene',
} as const;

// Data file paths
export const DATA_PATHS = {
    LEVEL_REGISTRY: 'data/levels/level_registry.json',
    NPC_REGISTRY: 'data/npcs/npc_registry.json',
    MATH_EASY: 'data/math/problems_easy.json',
    MATH_DATASET: 'data/math/problems_dataset.json',
    MATH_GAPS: 'data/math/problems_gaps.json',
    PLAYER_TUNING: 'data/tuning/player_base.json',
    ABILITIES: 'data/tuning/abilities.json',
    LEVELING: 'data/tuning/leveling.json',
    ENEMY_REGISTRY: 'data/enemies/enemy_registry.json',
    THEME_FOREST: 'data/themes/theme_forest.json',
    THEME_SCIFI: 'data/themes/theme_scifi.json',
    AUDIO_MANIFEST: 'data/audio/audio_manifest.json',
    STRINGS_EN: 'data/i18n/strings_en.json',
    STRINGS_IS: 'data/i18n/strings_is.json',
    MATH_CURRICULUM: 'data/math/problems_curriculum.json',
    COMBAT_TUNING: 'data/tuning/combat_tuning.json',
    CAMERA_TUNING: 'data/tuning/camera_tuning.json',
    MATH_TUNING: 'data/tuning/math_tuning.json',
} as const;

// Input action names
export const INPUT_ACTIONS = {
    MOVE_LEFT: 'move_left',
    MOVE_RIGHT: 'move_right',
    JUMP: 'jump',
    INTERACT: 'interact',
    PAUSE: 'pause',
} as const;
