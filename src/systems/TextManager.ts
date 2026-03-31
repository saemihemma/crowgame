/**
 * TextManager — i18n singleton.
 *
 * Loads default strings from a JSON file, then overlays any user-provided
 * translations stored in localStorage.  Every user-visible string in the
 * game should go through `TextManager.t(key, ...args)`.
 *
 * Template substitution uses `{0}`, `{1}`, etc. for positional args.
 */
export class TextManager {
    private static instance: TextManager;
    private defaults: Record<string, string> = {};
    private overrides: Record<string, string> = {};

    private static readonly STORAGE_KEY = 'crow_translations';

    private constructor() {}

    static getInstance(): TextManager {
        if (!TextManager.instance) {
            TextManager.instance = new TextManager();
        }
        return TextManager.instance;
    }

    /** Call once after loading the default strings JSON in BootScene. */
    init(defaultStrings: Record<string, string>): void {
        this.defaults = defaultStrings;
        this.loadOverrides();
        console.log(`[TextManager] Loaded ${Object.keys(this.defaults).length} default strings, ${Object.keys(this.overrides).length} overrides`);
    }

    /** Main accessor. Returns the translated (or default) string with template substitution. */
    t(key: string, ...args: (string | number)[]): string {
        let value = this.overrides[key] ?? this.defaults[key] ?? key;
        for (let i = 0; i < args.length; i++) {
            value = value.replace(`{${i}}`, String(args[i]));
        }
        return value;
    }

    /** Get all keys (for admin panel). */
    getAllKeys(): string[] {
        return Object.keys(this.defaults);
    }

    /** Get the default (English) value for a key. */
    getDefault(key: string): string {
        return this.defaults[key] ?? '';
    }

    /** Get current override for a key (empty string if none). */
    getOverride(key: string): string {
        return this.overrides[key] ?? '';
    }

    /** Set a single translation override. */
    setTranslation(key: string, value: string): void {
        if (value) {
            this.overrides[key] = value;
        } else {
            delete this.overrides[key];
        }
        this.saveOverrides();
    }

    /** Export all overrides as JSON object. */
    exportTranslations(): Record<string, string> {
        return { ...this.overrides };
    }

    /** Import translations (replaces all overrides). */
    importTranslations(data: Record<string, string>): void {
        this.overrides = { ...data };
        this.saveOverrides();
    }

    private loadOverrides(): void {
        try {
            const raw = localStorage.getItem(TextManager.STORAGE_KEY);
            if (raw) {
                this.overrides = JSON.parse(raw);
            }
        } catch {
            console.warn('[TextManager] Failed to load translation overrides');
        }
    }

    private saveOverrides(): void {
        try {
            localStorage.setItem(TextManager.STORAGE_KEY, JSON.stringify(this.overrides));
        } catch {
            console.warn('[TextManager] Failed to save translation overrides');
        }
    }
}
