import type { SaveData } from '../utils/Types';
import { EventBus, GameEvents } from '../utils/EventBus';
import { ELOManager } from '../math/ELOManager';
import { ProfileManager } from './ProfileManager';
import { LearnerStateManager } from './LearnerStateManager';

const SAVE_VERSION = 1;

/**
 * localStorage-based save/load system.
 * Auto-saves on level complete, coins changed, etc.
 * Now profile-aware: each user gets their own save key via ProfileManager.
 */
export class SaveManager {
    private static instance: SaveManager;
    private data: SaveData;
    private autoSaveEnabled = true;

    private constructor() {
        this.data = this.createDefaultSave();
        this.load();
        this.registerListeners();
    }

    static getInstance(): SaveManager {
        if (!SaveManager.instance) {
            SaveManager.instance = new SaveManager();
        }
        return SaveManager.instance;
    }

    /** Get the active save key (profile-aware). */
    private getSaveKey(): string {
        return ProfileManager.getInstance().getActiveSaveKey();
    }

    /** Get current save data (read-only snapshot) */
    getData(): Readonly<SaveData> {
        return this.data;
    }

    /** Save current data to localStorage */
    save(): void {
        try {
            this.data.timestamp = Date.now();
            // Update ELO stats from ELOManager before saving
            this.data.eloStats = ELOManager.getInstance().getStats();
            if (LearnerStateManager.getInstance().isInitialized()) {
                this.data.learnerState = LearnerStateManager.getInstance().getSnapshot();
            }
            localStorage.setItem(this.getSaveKey(), JSON.stringify(this.data));
        } catch (err) {
            console.warn('SaveManager: failed to save', err);
        }
    }

    /** Load from localStorage (or create default) */
    load(): void {
        try {
            const raw = localStorage.getItem(this.getSaveKey());
            if (raw) {
                const parsed = JSON.parse(raw) as SaveData;
                if (parsed.version === SAVE_VERSION) {
                    // Merge with defaults so any fields added after the
                    // save was first created get their default values.
                    const defaults = this.createDefaultSave();
                    this.data = { ...defaults, ...parsed };

                    // Deep-merge nested objects that spread would overwrite
                    this.data.mathStats = { ...defaults.mathStats, ...parsed.mathStats };
                    this.data.telemetry = { ...defaults.telemetry, ...parsed.telemetry };
                    this.data.settings = { ...defaults.settings, ...parsed.settings };
                    this.data.learnerState = parsed.learnerState ?? defaults.learnerState;

                    // Initialize ELO stats if not present (backward compatibility)
                    if (!this.data.eloStats) {
                        this.data.eloStats = ELOManager.getInstance().getStats();
                        console.log('[SaveManager] Initialized default ELO stats for existing save');
                    }

                    return;
                }
            }
        } catch (err) {
            console.warn('SaveManager: failed to load, using defaults', err);
        }
        this.data = this.createDefaultSave();
    }

    /** Switch to a different user profile and reload data. */
    switchProfile(): void {
        this.data = this.createDefaultSave();
        this.load();
    }

    /** Delete saved data */
    clear(): void {
        localStorage.removeItem(this.getSaveKey());
        const activeProfile = ProfileManager.getInstance().getActiveProfile();
        if (activeProfile?.childId) {
            localStorage.removeItem(`crow_learner_snapshot_${activeProfile.childId}`);
            localStorage.removeItem(`crow_learner_pending_attempts_${activeProfile.childId}`);
        }
        this.data = this.createDefaultSave();
    }

    /** Check if a save exists for the current profile */
    hasSave(): boolean {
        return localStorage.getItem(this.getSaveKey()) !== null;
    }

    // --- Convenience Mutators ---

    addCoins(amount: number): void {
        this.data.coins += amount;
        if (this.autoSaveEnabled) this.save();
    }

    addStars(amount: number): void {
        this.data.stars += amount;
        if (this.autoSaveEnabled) this.save();
    }

    incrementOwlsSaved(): void {
        this.data.owlsSaved++;
        if (this.autoSaveEnabled) this.save();
    }

    setCurrentLevel(level: string): void {
        this.data.currentLevel = level;
        if (this.autoSaveEnabled) this.save();
    }

    completeLevel(levelKey: string): void {
        if (!this.data.completedLevels.includes(levelKey)) {
            this.data.completedLevels.push(levelKey);
        }
        if (this.autoSaveEnabled) this.save();
    }

    recordMathAttempt(data: {
        skills: string[];
        correct: boolean;
        hintsUsed: number;
        timeMs: number;
        problemId: string;
    }): void {
        if (data.correct) {
            this.data.mathStats.totalCorrect++;
        } else {
            this.data.mathStats.totalWrong++;
        }

        for (const skill of data.skills) {
            if (!this.data.mathStats.bySkill[skill]) {
                this.data.mathStats.bySkill[skill] = { correct: 0, wrong: 0, avgTimeMs: 0 };
            }

            const entry = this.data.mathStats.bySkill[skill];
            if (data.correct) {
                entry.correct++;
            } else {
                entry.wrong++;
            }

            const total = entry.correct + entry.wrong;
            entry.avgTimeMs = ((entry.avgTimeMs * (total - 1)) + data.timeMs) / total;
        }

        this.data.telemetry.hintUsage += data.hintsUsed;
        this.data.telemetry.problemsAttempted++;
        this.data.telemetry.answeredProblemIds.push(data.problemId);
        this.data.telemetry.answeredProblemIds = this.data.telemetry.answeredProblemIds.slice(-100);
        if (this.autoSaveEnabled) this.save();
    }

    setLearnerState(): void {
        if (!LearnerStateManager.getInstance().isInitialized()) return;
        this.data.learnerState = LearnerStateManager.getInstance().getSnapshot();
        if (this.autoSaveEnabled) this.save();
    }

    grantAbility(abilityId: string): void {
        if (!this.data.activeAbilities.includes(abilityId)) {
            this.data.activeAbilities.push(abilityId);
        }
        if (this.autoSaveEnabled) this.save();
    }

    // --- Event Listeners for Auto-Save ---

    private registerListeners(): void {
        EventBus.on(GameEvents.COINS_CHANGED, (coins: number) => {
            this.data.coins = coins;
            if (this.autoSaveEnabled) this.save();
        });

        EventBus.on(GameEvents.OWL_SAVED, () => {
            this.incrementOwlsSaved();
        });

        EventBus.on(GameEvents.LEVEL_COMPLETE, (data: { completedLevel: string }) => {
            this.completeLevel(data.completedLevel);
        });

        EventBus.on(GameEvents.ABILITY_GRANTED, (data: { abilityId: string }) => {
            this.grantAbility(data.abilityId);
        });

        EventBus.on(GameEvents.SAVE_GAME, () => {
            this.save();
        });
    }

    private createDefaultSave(): SaveData {
        return {
            version: SAVE_VERSION,
            currentLevel: 'level_01',
            completedLevels: [],
            coins: 0,
            stars: 0,
            owlsSaved: 0,
            xp: 0,
            playerLevel: 1,
            inventory: [],
            activeAbilities: [],
            mathStats: {
                totalCorrect: 0,
                totalWrong: 0,
                bySkill: {},
            },
            telemetry: {
                hintUsage: 0,
                problemsAttempted: 0,
                answeredProblemIds: [],
            },
            settings: {
                musicVolume: 0.7,
                sfxVolume: 1.0,
            },
            timestamp: Date.now(),
        };
    }
}
