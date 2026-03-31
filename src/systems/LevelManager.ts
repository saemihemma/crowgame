import type { LevelRegistry, LevelRegistryEntry } from '../utils/Types';
import { EventBus, GameEvents } from '../utils/EventBus';

/**
 * Singleton that manages the level registry, tracks current level,
 * and orchestrates level transitions.
 */
export class LevelManager {
    private static instance: LevelManager;
    private registry: LevelRegistryEntry[] = [];
    private currentLevelKey = '';

    private constructor() {}

    static getInstance(): LevelManager {
        if (!LevelManager.instance) {
            LevelManager.instance = new LevelManager();
        }
        return LevelManager.instance;
    }

    /** Initialize from cached level_registry JSON (call once in BootScene) */
    init(registryData: LevelRegistry): void {
        this.registry = registryData.levels.sort((a, b) => a.order - b.order);
    }

    /** Get all registered levels in order */
    getLevels(): LevelRegistryEntry[] {
        return this.registry;
    }

    /** Get a specific level entry by key */
    getLevel(key: string): LevelRegistryEntry | undefined {
        return this.registry.find(l => l.key === key);
    }

    /** Get the current level key */
    getCurrentLevelKey(): string {
        return this.currentLevelKey;
    }

    /** Get the current level entry */
    getCurrentLevel(): LevelRegistryEntry | undefined {
        return this.getLevel(this.currentLevelKey);
    }

    /** Set the current level (called when a level starts) */
    setCurrentLevel(key: string): void {
        this.currentLevelKey = key;
    }

    /** Get the next level in order after the current one, or undefined if at end */
    getNextLevel(): LevelRegistryEntry | undefined {
        const currentIdx = this.registry.findIndex(l => l.key === this.currentLevelKey);
        if (currentIdx < 0 || currentIdx >= this.registry.length - 1) return undefined;
        return this.registry[currentIdx + 1];
    }

    /** Get the next level key, or empty string if none */
    getNextLevelKey(): string {
        return this.getNextLevel()?.key ?? '';
    }

    /**
     * Transition to a target level.
     * Emits LEVEL_COMPLETE for the current level, then returns the target key
     * so the caller (GameScene) can restart with it.
     */
    transitionTo(targetLevelKey: string): string {
        // Emit completion event for the current level
        if (this.currentLevelKey) {
            EventBus.emit(GameEvents.LEVEL_COMPLETE, {
                completedLevel: this.currentLevelKey,
                nextLevel: targetLevelKey,
            });
        }
        return targetLevelKey;
    }

    /** Check if a level key exists in the registry */
    hasLevel(key: string): boolean {
        return this.registry.some(l => l.key === key);
    }
}
