import type { ThemeDefinition, ThemePalette } from './ThemeTypes';
import { EventBus } from '../../utils/EventBus';

/** Event emitted when the active theme changes */
export const THEME_CHANGED = 'theme-changed';

/**
 * Singleton manager for the UI theme system.
 * Loads theme JSON definitions and provides accessors for all UI components.
 * Each world/level can specify a theme, and switching themes re-skins the entire UI.
 */
export class ThemeManager {
    private static instance: ThemeManager;
    private themes: Map<string, ThemeDefinition> = new Map();
    private activeTheme: ThemeDefinition | null = null;

    private constructor() {}

    static getInstance(): ThemeManager {
        if (!ThemeManager.instance) {
            ThemeManager.instance = new ThemeManager();
        }
        return ThemeManager.instance;
    }

    /** Register a theme definition (call during boot after loading JSON) */
    registerTheme(theme: ThemeDefinition): void {
        this.themes.set(theme.id, theme);
    }

    /** Set the active theme by id. Emits THEME_CHANGED event. */
    setTheme(themeId: string): void {
        const theme = this.themes.get(themeId);
        if (!theme) {
            console.warn(`ThemeManager: unknown theme "${themeId}", keeping current.`);
            return;
        }
        this.activeTheme = theme;
        EventBus.emit(THEME_CHANGED, theme);
    }

    /** Get the currently active theme definition */
    getTheme(): ThemeDefinition {
        if (!this.activeTheme) {
            throw new Error('ThemeManager: no active theme set. Call setTheme() first.');
        }
        return this.activeTheme;
    }

    /** Get a palette color as a hex number (for Phaser tinting/graphics) */
    getColorNum(key: keyof ThemePalette): number {
        const hex = this.getTheme().palette[key];
        return parseInt(hex.replace('#', ''), 16);
    }

    /** Get a palette color as a CSS string */
    getColor(key: keyof ThemePalette): string {
        return this.getTheme().palette[key];
    }

    /** Get a sprite key from a theme section */
    getSprite(section: 'hud' | 'mathBoard' | 'controls' | 'door' | 'dialog', key: string): string {
        const sectionData = this.getTheme()[section] as unknown as Record<string, unknown>;
        return (sectionData[key] as string) ?? '';
    }

    /** Get the full config for a theme section */
    getConfig<K extends keyof ThemeDefinition>(section: K): ThemeDefinition[K] {
        return this.getTheme()[section];
    }

    /** Check if a theme is registered */
    hasTheme(themeId: string): boolean {
        return this.themes.has(themeId);
    }

    /** Get the active theme id */
    getActiveThemeId(): string {
        return this.activeTheme?.id ?? '';
    }
}
