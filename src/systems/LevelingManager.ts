import { EventBus, GameEvents } from '../utils/EventBus';
import { SaveManager } from './SaveManager';

export interface LevelingConfig {
    maxLevel: number;
    xpPerLevel: number[];
    scoring: {
        correctFirstAttempt: number;
        correctSecondAttempt: number;
        doubleFailure: number;
    };
    levelUnlocks: Record<string, unknown>;
}

export class LevelingManager {
    private static instance: LevelingManager;
    private config!: LevelingConfig;
    private xp = 0;
    private playerLevel = 1;

    private constructor() {}

    static getInstance(): LevelingManager {
        if (!LevelingManager.instance) {
            LevelingManager.instance = new LevelingManager();
        }
        return LevelingManager.instance;
    }

    init(config: LevelingConfig): void {
        this.config = config;

        // Load persisted state (with fallbacks for old saves missing these fields)
        const save = SaveManager.getInstance().getData();
        this.xp = save.xp ?? 0;
        this.playerLevel = save.playerLevel ?? 1;

        // Listen for math challenge results
        EventBus.on(GameEvents.MATH_CHALLENGE_COMPLETE, this.onMathComplete, this);
    }

    getXP(): number { return this.xp; }
    getPlayerLevel(): number { return this.playerLevel; }

    getXPForCurrentLevel(): number {
        if (!this.config?.xpPerLevel?.length) return 10; // safe fallback
        const idx = Math.max(0, Math.min((this.playerLevel || 1) - 1, this.config.xpPerLevel.length - 1));
        return this.config.xpPerLevel[idx] ?? 10;
    }

    getXPProgress(): number {
        return this.xp;
    }

    addXP(amount: number): void {
        this.xp += amount;
        if (this.xp < 0) this.xp = 0;

        // Check for level up
        while (this.playerLevel < this.config.maxLevel) {
            const needed = this.getXPForCurrentLevel();
            if (this.xp >= needed) {
                this.xp -= needed;
                this.playerLevel++;
                EventBus.emit(GameEvents.LEVEL_UP, { level: this.playerLevel });
            } else {
                break;
            }
        }

        // Persist
        const sm = SaveManager.getInstance();
        (sm.getData() as { xp: number; playerLevel: number }).xp = this.xp;
        (sm.getData() as { xp: number; playerLevel: number }).playerLevel = this.playerLevel;
        sm.save();

        EventBus.emit(GameEvents.XP_CHANGED, {
            xp: this.xp,
            level: this.playerLevel,
            needed: this.getXPForCurrentLevel(),
        });
    }

    private onMathComplete = (data: { correct: boolean; firstAttempt: boolean }): void => {
        const s = this.config.scoring;
        if (data.correct) {
            this.addXP(data.firstAttempt ? s.correctFirstAttempt : s.correctSecondAttempt);
        } else {
            this.addXP(s.doubleFailure);
        }
    };
}
