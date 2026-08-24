import { EventBus, GameEvents } from '../utils/EventBus';

/** Locales the game ships. English is always the fallback. */
export const LOCALES = ['en', 'is'] as const;
export type Locale = (typeof LOCALES)[number];

/** Human-readable name for each locale, always written in that locale. */
export const LOCALE_ENDONYMS: Record<Locale, string> = {
    en: 'English',
    is: 'Íslenska',
};

const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(code: string): code is Locale {
    return (LOCALES as readonly string[]).includes(code);
}

/**
 * TextManager — i18n singleton.
 *
 * Mirrors the contract of the Godot port's `text_manager.gd`: bundles are
 * loaded per locale, the active locale overlays English, and English is always
 * the final fallback before the raw key.
 *
 * Resolution order for `t(key)`:
 *   user override (for the active locale) -> active locale -> English -> key
 *
 * Template substitution uses `{0}`, `{1}`, etc. for positional args.
 */
export class TextManager {
    private static instance: TextManager;

    private bundles: Record<Locale, Record<string, string>> = { en: {}, is: {} };
    private overrides: Record<Locale, Record<string, string>> = { en: {}, is: {} };
    private locale: Locale = DEFAULT_LOCALE;

    /** Per-locale override buckets. */
    private static readonly STORAGE_KEY = 'crow_translations_v2';
    /** Pre-locale flat override map; migrated into the English bucket. */
    private static readonly LEGACY_STORAGE_KEY = 'crow_translations';
    /** Same key the Godot port persists the locale under. */
    private static readonly LOCALE_KEY = 'crow_locale';

    private constructor() {}

    static getInstance(): TextManager {
        if (!TextManager.instance) {
            TextManager.instance = new TextManager();
        }
        return TextManager.instance;
    }

    /**
     * Call once after loading the string bundles in BootScene.
     *
     * The active locale is the stored player choice if there is one, otherwise
     * a guess from the browser language, otherwise English.
     */
    init(bundles: Partial<Record<Locale, Record<string, string>>>): void {
        for (const code of LOCALES) {
            this.bundles[code] = bundles[code] ?? {};
        }
        this.loadOverrides();
        this.applyLocale(this.readStoredLocale() ?? TextManager.detectLocale());
        console.log(
            `[TextManager] locale=${this.locale}, ` +
            LOCALES.map(c => `${c}:${Object.keys(this.bundles[c]).length}`).join(' ') +
            `, overrides ${LOCALES.map(c => `${c}:${Object.keys(this.overrides[c]).length}`).join(' ')}`,
        );
    }

    /** Main accessor. Returns the translated string with template substitution. */
    t(key: string, ...args: (string | number)[]): string {
        let value =
            this.overrides[this.locale][key] ??
            this.bundles[this.locale][key] ??
            this.bundles[DEFAULT_LOCALE][key] ??
            key;
        for (let i = 0; i < args.length; i++) {
            value = value.replace(`{${i}}`, String(args[i]));
        }
        return value;
    }

    /**
     * Resolve a key with NAMED parameters: `t()` substitutes `{0}`, `{1}`, this
     * substitutes `{a}`, `{op}`, `{sum}`.
     *
     * The math pools need names rather than positions. A prompt template is
     * "What is {a} {op} {b}?" and its Icelandic counterpart may put the operands
     * in a different order; with positional args the two locales would silently
     * disagree about which number goes where. Names make the mapping explicit and
     * checkable, which is what tools/validate_i18n.mjs checks.
     *
     * A parameter may itself be a `{ key, params }` reference, which is rendered
     * first. That is how a prefixed prompt composes: "Mixed fact: {inner}" where
     * `inner` is the phrasing for "What is 3 × 4?".
     *
     * Returns null when the key resolves to nothing, so the caller can fall back
     * to the canonical English in the problem data rather than render a raw key
     * at a child.
     */
    tp(key: string, params: Record<string, unknown> = {}, plural?: string): string | null {
        const resolved = this.pluralKey(key, params, plural);
        const template =
            this.overrides[this.locale][resolved] ??
            this.bundles[this.locale][resolved] ??
            this.bundles[DEFAULT_LOCALE][resolved] ??
            // A locale that has no `.one` form for this key falls back to the
            // base key rather than to English, so it keeps its own wording.
            this.overrides[this.locale][key] ??
            this.bundles[this.locale][key] ??
            this.bundles[DEFAULT_LOCALE][key];
        if (template === undefined) return null;
        return this.substitute(template, params);
    }

    /**
     * Pick the `.one` variant of a key when the number driving it takes the
     * singular in the ACTIVE locale.
     *
     * The rule differs per language and that is the whole reason it lives here
     * rather than in the data: English inflects at 1, Icelandic at 1 and at
     * anything else ending in 1 except 11 -- so 21 is "1 hópur" territory but
     * plain "21 groups" in English. The data names which parameter drives the
     * agreement (`plural`); each locale decides what to do with its value.
     */
    private pluralKey(key: string, params: Record<string, unknown>, plural?: string): string {
        if (!plural) return key;
        const value = params[plural];
        if (typeof value !== 'number') return key;
        const isOne = this.locale === 'is'
            ? (value % 10 === 1 && value % 100 !== 11)
            : value === 1;
        return isOne ? `${key}.one` : key;
    }

    private substitute(template: string, params: Record<string, unknown>): string {
        return template.replace(/\{([a-z][a-z0-9]*)\}/g, (whole, name: string) => {
            const value = params[name];
            if (value === undefined || value === null) return whole;
            if (typeof value === 'object') {
                const ref = value as { key?: unknown; params?: unknown };
                if (typeof ref.key !== 'string') return whole;
                const nested = this.tp(
                    ref.key,
                    (ref.params ?? {}) as Record<string, unknown>,
                    typeof (value as { plural?: unknown }).plural === 'string'
                        ? (value as { plural: string }).plural
                        : undefined,
                );
                return nested ?? whole;
            }
            return String(value);
        });
    }

    /**
     * Whether a key exists in any bundle. Lets callers fall back to data that
     * is not translated yet (level names come from the level registry).
     */
    has(key: string): boolean {
        return key in this.bundles[this.locale] || key in this.bundles[DEFAULT_LOCALE];
    }

    // ─── Locale ───────────────────────────────────────────────

    getLocale(): Locale {
        return this.locale;
    }

    availableLocales(): readonly Locale[] {
        return LOCALES;
    }

    /**
     * Switch locale, persist the choice, and announce it.
     *
     * Scenes are responsible for re-rendering; they listen for
     * `GameEvents.LOCALE_CHANGED` or simply restart.
     */
    setLocale(code: string): void {
        const next: Locale = isLocale(code) ? code : DEFAULT_LOCALE;
        if (next === this.locale) return;
        this.applyLocale(next);
        try {
            localStorage.setItem(TextManager.LOCALE_KEY, next);
        } catch {
            console.warn('[TextManager] Failed to persist locale');
        }
        EventBus.emit(GameEvents.LOCALE_CHANGED, next);
    }

    private applyLocale(code: Locale): void {
        this.locale = code;
        // Keep the document language in step so the browser and assistive tech agree.
        if (typeof document !== 'undefined') {
            document.documentElement.lang = code;
        }
    }

    private readStoredLocale(): Locale | null {
        try {
            const raw = localStorage.getItem(TextManager.LOCALE_KEY);
            return raw && isLocale(raw) ? raw : null;
        } catch {
            return null;
        }
    }

    /** First run: honour the browser's language before defaulting to English. */
    private static detectLocale(): Locale {
        if (typeof navigator === 'undefined') return DEFAULT_LOCALE;
        const candidates = [navigator.language, ...(navigator.languages ?? [])];
        for (const tag of candidates) {
            const base = (tag ?? '').toLowerCase().split('-')[0];
            if (isLocale(base)) return base;
        }
        return DEFAULT_LOCALE;
    }

    // ─── Admin / translation-editor surface ───────────────────

    /** Get all keys (for admin panel). Keys come from the English bundle. */
    getAllKeys(): string[] {
        return Object.keys(this.bundles[DEFAULT_LOCALE]);
    }

    /** Get the shipped value for a key in a locale (defaults to the active one). */
    getShipped(key: string, locale: Locale = this.locale): string {
        return this.bundles[locale][key] ?? '';
    }

    /** Get the English value for a key. */
    getDefault(key: string): string {
        return this.bundles[DEFAULT_LOCALE][key] ?? '';
    }

    /** Get current override for a key in a locale (empty string if none). */
    getOverride(key: string, locale: Locale = this.locale): string {
        return this.overrides[locale][key] ?? '';
    }

    /** Set a single translation override for a locale. */
    setTranslation(key: string, value: string, locale: Locale = this.locale): void {
        if (value) {
            this.overrides[locale][key] = value;
        } else {
            delete this.overrides[locale][key];
        }
        this.saveOverrides();
    }

    /** Export the override bucket for a locale. */
    exportTranslations(locale: Locale = this.locale): Record<string, string> {
        return { ...this.overrides[locale] };
    }

    /** Import translations for a locale (replaces that locale's overrides). */
    importTranslations(data: Record<string, string>, locale: Locale = this.locale): void {
        this.overrides[locale] = { ...data };
        this.saveOverrides();
    }

    // ─── Override persistence ─────────────────────────────────

    /**
     * Load per-locale override buckets.
     *
     * Overrides used to live in one flat, locale-blind map, which meant an
     * Icelandic edit would also override English once a second locale became
     * selectable. The legacy map is read into the English bucket and left on
     * disk untouched, so an older build still finds what it expects.
     */
    private loadOverrides(): void {
        try {
            const raw = localStorage.getItem(TextManager.STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw) as Partial<Record<Locale, Record<string, string>>>;
                for (const code of LOCALES) {
                    this.overrides[code] = parsed[code] ?? {};
                }
                return;
            }

            const legacy = localStorage.getItem(TextManager.LEGACY_STORAGE_KEY);
            if (legacy) {
                this.overrides.en = JSON.parse(legacy) as Record<string, string>;
                this.saveOverrides();
                console.log('[TextManager] Migrated legacy overrides into the English bucket');
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
