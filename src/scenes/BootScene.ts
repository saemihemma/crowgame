import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT, DATA_PATHS } from '../utils/Constants';
import { ThemeManager } from '../ui/theme/ThemeManager';
import { LevelManager } from '../systems/LevelManager';
import { NPCFactory } from '../systems/NPCFactory';
import { MathProblemManager } from '../math/MathProblemManager';
import { SaveManager } from '../systems/SaveManager';
import { LevelingManager, type LevelingConfig } from '../systems/LevelingManager';
import { AudioManager, type AudioManifest } from '../systems/AudioManager';
import { ELOManager } from '../math/ELOManager';
import { ELOUpdateManager } from '../systems/ELOUpdateManager';
import { TextManager } from '../systems/TextManager';
import { ProfileManager } from '../systems/ProfileManager';
import { LearnerStateManager } from '../systems/LearnerStateManager';
import { LearnerSyncService } from '../systems/LearnerSyncService';
import type { ThemeDefinition } from '../ui/theme/ThemeTypes';
import type { LevelRegistry, NPCRegistry, MathProblemPool } from '../utils/Types';
import type { EnemyRegistry } from '../entities/enemies/Enemy';

export class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: SCENES.BOOT });
    }

    preload(): void {
        // Loading bar
        const barWidth = 400;
        const barHeight = 32;
        const barX = (GAME_WIDTH - barWidth) / 2;
        const barY = GAME_HEIGHT / 2;

        const progressBg = this.add.graphics();
        progressBg.fillStyle(0x222222, 1);
        progressBg.fillRect(barX, barY, barWidth, barHeight);

        const progressBar = this.add.graphics();
        this.load.on('progress', (value: number) => {
            progressBar.clear();
            progressBar.fillStyle(0xffffff, 1);
            progressBar.fillRect(barX + 2, barY + 2, (barWidth - 4) * value, barHeight - 4);
        });

        this.load.on('complete', () => {
            progressBg.destroy();
            progressBar.destroy();
        });

        // --- Load data files ---
        this.load.json('player_tuning', DATA_PATHS.PLAYER_TUNING);
        this.load.json('abilities_data', DATA_PATHS.ABILITIES);
        this.load.json('level_registry', DATA_PATHS.LEVEL_REGISTRY);
        this.load.json('npc_registry', DATA_PATHS.NPC_REGISTRY);
        this.load.json('math_easy', DATA_PATHS.MATH_EASY);
        this.load.json('math_dataset', DATA_PATHS.MATH_DATASET);
        this.load.json('math_gaps', DATA_PATHS.MATH_GAPS);
        this.load.json('math_curriculum', DATA_PATHS.MATH_CURRICULUM);
        this.load.json('enemy_registry', DATA_PATHS.ENEMY_REGISTRY);
        this.load.json('leveling', DATA_PATHS.LEVELING);
        this.load.json('combat_tuning', DATA_PATHS.COMBAT_TUNING);
        this.load.json('camera_tuning', DATA_PATHS.CAMERA_TUNING);

        // --- Load theme data ---
        this.load.json('theme_forest', DATA_PATHS.THEME_FOREST);
        this.load.json('theme_scifi', DATA_PATHS.THEME_SCIFI);

        // --- Load audio manifest ---
        this.load.json('audio_manifest', DATA_PATHS.AUDIO_MANIFEST);

        // --- Load i18n strings ---
        this.load.json('strings_en', DATA_PATHS.STRINGS_EN);

        // --- Global error handler for missing assets ---
        this.load.on('loaderror', (file: Phaser.Loader.File) => {
            console.warn(`[BootScene] Asset not found (skipped): ${file.key} (${file.type})`);
        });

        // --- Load audio files (with error handling for missing files) ---
        this.loadAudioFiles();

        // --- Load level art ---
        // Door sprite sheet: 36 gameplay-sized frames in a 6x6 grid.
        this.load.spritesheet('door', 'assets/sprites/objects/door/door-36-runtime-88x96.png', {
            frameWidth: 88,
            frameHeight: 96
        });

        // --- Load tilesets ---
        this.load.image('forest_tiles', 'assets/tilesets/forest_tiles.png');
        this.load.image('level1_tiles', 'assets/tilesets/level1_tiles.png');

        // --- Load spike hazard spritesheet ---
        this.load.image('spike_hazards', 'assets/tilesets/spike_hazards.png');

        // --- Load crow idle sprite (crow1) ---
        // Using fixed 64px crow1 with content at bottom (no padding) - matches walking animation structure
        this.load.image('crow', 'assets/sprites/characters/crow2/crow3/crow1-64px-fixed.png');

        // --- Load crow walking animation ---
        // 3x3 grid (9 frames) with all frames properly bottom-aligned
        this.load.spritesheet('crow_walk', 'assets/sprites/characters/crow2/crow3/crow-walk-64px-fixed.png', {
            frameWidth: 64,
            frameHeight: 64
        });

        // --- Load owl NPC as a gameplay-sized export ---
        this.load.image('owl', 'assets/sprites/characters/npcs/owl-runtime-64.png');

        // --- Load cockroach as single image (no spritesheet) ---
        this.load.image('cockroach', 'assets/sprites/characters/npcs/cockroach.png');

        // --- Load coin spritesheet ---
        // Coin sprite: 9 gameplay-sized frames in a 3x3 grid.
        this.load.spritesheet('coin', 'assets/sprites/ui/coin/coinsprite-runtime-32.png', {
            frameWidth: 32,
            frameHeight: 32
        });

        // Levels are loaded dynamically in create() after registry is parsed
    }

    create(): void {
        // Initialize TextManager with default strings
        const defaultStrings = this.cache.json.get('strings_en') as Record<string, string>;
        if (defaultStrings) {
            TextManager.getInstance().init(defaultStrings);
        }

        // Initialize ProfileManager (loads from localStorage)
        ProfileManager.getInstance();

        // Define spike frames if texture loaded successfully
        if (this.textures.exists('spike_hazards')) {
            this.defineSpikeFrames();
        }

        // Create animations
        this.createAnimations();

        // Register themes
        this.registerThemes();

        // Initialize LevelManager from registry
        const registryData = this.cache.json.get('level_registry') as LevelRegistry;
        LevelManager.getInstance().init(registryData);

        // Initialize NPCFactory from registry
        const npcRegistryData = this.cache.json.get('npc_registry') as NPCRegistry;
        if (npcRegistryData) {
            NPCFactory.getInstance().init(npcRegistryData);
        }

        // Initialize MathProblemManager with problem pools
        const mathEasy = this.cache.json.get('math_easy') as MathProblemPool;
        if (mathEasy) {
            MathProblemManager.getInstance().addPool('easy', mathEasy);
        }
        const mathDataset = this.cache.json.get('math_dataset') as MathProblemPool;
        if (mathDataset) {
            MathProblemManager.getInstance().addPool('dataset', mathDataset);
            console.log('[Boot] Loaded dataset with', mathDataset.problems.length, 'problems');
        }
        const mathGaps = this.cache.json.get('math_gaps') as MathProblemPool;
        if (mathGaps) {
            MathProblemManager.getInstance().addPool('gaps', mathGaps);
            console.log('[Boot] Loaded gaps pool with', mathGaps.problems.length, 'problems');
        }
        const mathCurriculum = this.cache.json.get('math_curriculum') as MathProblemPool;
        if (mathCurriculum) {
            MathProblemManager.getInstance().addPool('curriculum', mathCurriculum);
            console.log('[Boot] Loaded curriculum pool with', mathCurriculum.problems.length, 'problems');
        }
        console.log('[Boot] Total problems loaded:', MathProblemManager.getInstance().getTotalCount());

        // Initialize SaveManager (loads from localStorage for active profile)
        SaveManager.getInstance();

        // Initialize ELO system with saved stats
        const saveData = SaveManager.getInstance().getData();
        ELOManager.getInstance().initialize(saveData.eloStats);
        LearnerStateManager.getInstance().initialize(
            ProfileManager.getInstance().getActiveProfile(),
            saveData.learnerState,
            ELOManager.getInstance().getStats(),
        );
        MathProblemManager.getInstance().hydrateRecentProblems(
            LearnerStateManager.getInstance().getSnapshot().recentProblemIds,
        );
        LearnerSyncService.getInstance().init(LearnerStateManager.getInstance().getSnapshot());

        // Initialize ELO update listener
        ELOUpdateManager.getInstance().init();
        console.log('[Boot] ELO update system initialized');

        // Initialize LevelingManager
        const levelingConfig = this.cache.json.get('leveling') as LevelingConfig;
        if (levelingConfig) {
            LevelingManager.getInstance().init(levelingConfig);
        }

        // Load audio files from manifest, then initialize AudioManager and start game
        const audioManifest = this.cache.json.get('audio_manifest') as AudioManifest;
        this.loadAudioAndLevels(audioManifest, registryData);
    }

    /** Load audio files + level tilemaps, then initialize AudioManager and start game */
    private loadAudioAndLevels(audioManifest: AudioManifest | null, registry: LevelRegistry): void {
        let assetsToLoad = 0;

        // Queue audio files from manifest
        if (audioManifest) {
            for (const [key, config] of Object.entries(audioManifest.sfx)) {
                if (!this.cache.audio.exists(key)) {
                    this.load.audio(key, config.file);
                    assetsToLoad++;
                }
            }
            for (const [key, config] of Object.entries(audioManifest.music)) {
                if (!this.cache.audio.exists(key)) {
                    this.load.audio(key, config.file);
                    assetsToLoad++;
                }
            }
        }

        // Queue level tilemaps
        for (const level of registry.levels) {
            if (!this.cache.tilemap.has(level.key)) {
                this.load.tilemapTiledJSON(level.key, level.mapFile);
                assetsToLoad++;
            }
        }

        const initAudioAndStart = () => {
            if (audioManifest) {
                AudioManager.getInstance().init(this, audioManifest);
            } else {
                console.warn('[BootScene] Audio manifest not found, running in silent mode');
                AudioManager.getInstance().setSilentMode(true);
            }
            this.startGame();
        };

        if (assetsToLoad === 0) {
            initAudioAndStart();
            return;
        }

        this.load.once('complete', () => {
            initAudioAndStart();
        });
        this.load.start();
    }

    private startGame(): void {
        // If a user is already logged in, skip login and go to main menu
        const pm = ProfileManager.getInstance();
        if (pm.getActiveUser()) {
            SaveManager.getInstance().switchProfile();
            const saveData = SaveManager.getInstance().getData();
            ELOManager.getInstance().initialize(saveData.eloStats);
            LearnerStateManager.getInstance().initialize(
                pm.getActiveProfile(),
                saveData.learnerState,
                ELOManager.getInstance().getStats(),
            );
            MathProblemManager.getInstance().hydrateRecentProblems(
                LearnerStateManager.getInstance().getSnapshot().recentProblemIds,
            );
            LearnerSyncService.getInstance().init(LearnerStateManager.getInstance().getSnapshot());
            this.scene.start(SCENES.MAIN_MENU);
        } else {
            this.scene.start(SCENES.LOGIN);
        }
    }

    private registerThemes(): void {
        const tm = ThemeManager.getInstance();

        // Register forest theme
        const forestTheme = this.cache.json.get('theme_forest') as ThemeDefinition;
        if (forestTheme) {
            tm.registerTheme(forestTheme);
        }

        // Register sci-fi theme
        const scifiTheme = this.cache.json.get('theme_scifi') as ThemeDefinition;
        if (scifiTheme) {
            tm.registerTheme(scifiTheme);
        }

        // Set default theme
        tm.setTheme('forest');
    }

    /**
     * Define variable-width frames for spike hazards.
     * Only called if spike_hazards texture loaded successfully.
     */
    private defineSpikeFrames(): void {
        const spikeTexture = this.textures.get('spike_hazards');
        const frames = [
            // Row 1 - spike variant 1
            { key: 'spike_1_32', x: 0, y: 0, width: 32, height: 32 },
            { key: 'spike_1_64', x: 32, y: 0, width: 64, height: 32 },
            { key: 'spike_1_96', x: 96, y: 0, width: 96, height: 32 },
            { key: 'spike_1_128', x: 192, y: 0, width: 128, height: 32 },
            // Row 2 - spike variant 2
            { key: 'spike_2_32', x: 0, y: 32, width: 32, height: 32 },
            { key: 'spike_2_64', x: 32, y: 32, width: 64, height: 32 },
            { key: 'spike_2_96', x: 96, y: 32, width: 96, height: 32 },
            { key: 'spike_2_128', x: 192, y: 32, width: 128, height: 32 },
            // Row 3 - spike variant 3
            { key: 'spike_3_32', x: 0, y: 64, width: 32, height: 32 },
            { key: 'spike_3_64', x: 32, y: 64, width: 64, height: 32 },
            { key: 'spike_3_96', x: 96, y: 64, width: 96, height: 32 },
            { key: 'spike_3_128', x: 192, y: 64, width: 128, height: 32 },
            // Row 4 - spike variant 4
            { key: 'spike_4_32', x: 0, y: 96, width: 32, height: 32 },
            { key: 'spike_4_64', x: 32, y: 96, width: 64, height: 32 },
            { key: 'spike_4_96', x: 96, y: 96, width: 96, height: 32 },
            { key: 'spike_4_128', x: 192, y: 96, width: 128, height: 32 },
        ];

        frames.forEach(frame => {
            spikeTexture.add(frame.key, 0, frame.x, frame.y, frame.width, frame.height);
        });

        console.log('[BootScene] Defined 16 spike hazard frames');
    }

    /**
     * Load audio files from manifest with graceful error handling.
     * Audio files that don't exist will be skipped without crashing.
     * This allows the audio system to work in "placeholder mode" before sounds are added.
     */
    private loadAudioFiles(): void {
        // Note: At this point in preload(), the audio manifest JSON hasn't loaded yet.
        // We'll handle graceful fallback in AudioManager when audio files don't exist.
        // Register error handlers to prevent crashes if files don't exist.

        this.load.on('loaderror', (file: Phaser.Loader.File) => {
            if (file.type === 'audio') {
                console.warn(`[BootScene] Audio file not found (placeholder mode): ${file.key}`);
                // Don't crash, just skip this audio file
            }
        });

        // AudioManager will handle missing files gracefully when playSFX/playMusic is called
    }

    private createAnimations(): void {

        // ── Coin ─────────────────────────────────────────────────
        // Coin sprite: 9 frames in 3x3 grid (263x264 per frame)
        this.anims.create({
            key: 'coin_spin',
            frames: this.anims.generateFrameNumbers('coin', { start: 0, end: 8 }),
            frameRate: 12,
            repeat: -1,
        });

        // ── Owl NPC ──────────────────────────────────────────────
        // Loaded as single image - no animation needed

        // ── Door ─────────────────────────────────────────────────
        // Idle: show only first frame (closed door)
        this.anims.create({
            key: 'door_idle',
            frames: [{ key: 'door', frame: 0 }],
            frameRate: 1,
            repeat: 0,
        });

        // Open: full 36-frame animation when player is in proximity
        this.anims.create({
            key: 'door_open',
            frames: this.anims.generateFrameNumbers('door', { start: 0, end: 35 }),
            frameRate: 24,
            repeat: 0,
        });

        // ── Crow Walking Animation ──────────────────────────────
        // 9 frames walking animation (3x3 grid)
        // frameRate: 10 for better pixel art clarity (typical range: 8-10 fps)
        this.anims.create({
            key: 'crow_walk',
            frames: this.anims.generateFrameNumbers('crow_walk', { start: 0, end: 8 }),
            frameRate: 10,
            repeat: -1,
        });

    }
}
