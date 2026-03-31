/**
 * ProfileManager — Multi-user profile system.
 *
 * Stores user profiles (username + 4-digit PIN) in localStorage.
 * Each profile maps to its own save key: `crow_save_<username>`.
 */
export interface UserProfile {
    username: string;
    pinHash: string;
    createdAt: number;
    childId: string;
    familyId: string;
}

export class ProfileManager {
    private static instance: ProfileManager;
    private profiles: UserProfile[] = [];
    private activeUser: string | null = null;

    private static readonly PROFILES_KEY = 'crow_profiles';
    private static readonly ACTIVE_KEY = 'crow_active_user';
    private static readonly FAMILY_KEY = 'crow_family_id';

    private constructor() {
        this.load();
    }

    static getInstance(): ProfileManager {
        if (!ProfileManager.instance) {
            ProfileManager.instance = new ProfileManager();
        }
        return ProfileManager.instance;
    }

    /** Get all existing profiles. */
    getProfiles(): UserProfile[] {
        return [...this.profiles];
    }

    /** Get currently active username (or null). */
    getActiveUser(): string | null {
        return this.activeUser;
    }

    /** Get the full active profile, if any. */
    getActiveProfile(): UserProfile | null {
        const activeUser = this.activeUser;
        if (!activeUser) return null;
        return this.profiles.find(
            profile => profile.username.toLowerCase() === activeUser.toLowerCase(),
        ) ?? null;
    }

    /** Get the localStorage save key for a given user. */
    getSaveKeyForUser(username: string): string {
        return `crow_save_${username}`;
    }

    /** Get save key for the active user. Falls back to legacy key. */
    getActiveSaveKey(): string {
        if (this.activeUser) {
            return this.getSaveKeyForUser(this.activeUser);
        }
        return 'crow_save_v1'; // legacy fallback
    }

    /**
     * Create a new profile.
     * @returns true on success, error string on failure.
     */
    createProfile(username: string, pin: string): true | string {
        const trimmed = username.trim();
        if (!trimmed) return 'Name cannot be empty';
        if (trimmed.length > 12) return 'Name too long (max 12)';
        if (!/^\d{4}$/.test(pin)) return 'PIN must be exactly 4 digits';
        if (this.profiles.some(p => p.username.toLowerCase() === trimmed.toLowerCase())) {
            return 'Name already taken!';
        }

        this.profiles.push({
            username: trimmed,
            pinHash: this.hashPin(trimmed, pin),
            createdAt: Date.now(),
            childId: this.generateId('child'),
            familyId: this.getOrCreateFamilyId(),
        });
        this.save();
        return true;
    }

    /**
     * Attempt login. Returns true on success.
     */
    login(username: string, pin: string): boolean {
        const profile = this.profiles.find(
            p => p.username.toLowerCase() === username.toLowerCase()
        );
        if (!profile) return false;
        if (profile.pinHash !== this.hashPin(profile.username, pin)) return false;

        this.activeUser = profile.username;
        try {
            localStorage.setItem(ProfileManager.ACTIVE_KEY, profile.username);
        } catch { /* ignore */ }
        return true;
    }

    /** Log out (clear active user). */
    logout(): void {
        this.activeUser = null;
        try {
            localStorage.removeItem(ProfileManager.ACTIVE_KEY);
        } catch { /* ignore */ }
    }

    /** Delete a profile and its save data. */
    deleteProfile(username: string): void {
        const profile = this.profiles.find(
            p => p.username.toLowerCase() === username.toLowerCase()
        );
        this.profiles = this.profiles.filter(
            p => p.username.toLowerCase() !== username.toLowerCase()
        );
        try {
            localStorage.removeItem(this.getSaveKeyForUser(username));
            if (profile?.childId) {
                localStorage.removeItem(`crow_learner_snapshot_${profile.childId}`);
                localStorage.removeItem(`crow_learner_pending_attempts_${profile.childId}`);
            }
        } catch { /* ignore */ }
        if (this.activeUser?.toLowerCase() === username.toLowerCase()) {
            this.logout();
        }
        this.save();
    }

    /** Check if there are any profiles at all. */
    hasProfiles(): boolean {
        return this.profiles.length > 0;
    }

    /**
     * Migrate legacy single-user save into the profile system.
     * Helper for manual or future migration from the old save format.
     */
    migrateLegacySave(defaultUsername: string, defaultPin: string): void {
        const legacyData = localStorage.getItem('crow_save_v1');
        if (!legacyData) return;

        // Only migrate if no profiles exist yet
        if (this.profiles.length > 0) return;

        const result = this.createProfile(defaultUsername, defaultPin);
        if (result !== true) return;

        // Copy legacy save to user-specific key
        try {
            localStorage.setItem(this.getSaveKeyForUser(defaultUsername), legacyData);
        } catch { /* ignore */ }
    }

    // ─── Internal ─────────────────────────────────────────────

    private hashPin(username: string, pin: string): string {
        return btoa(pin + ':' + username.toLowerCase());
    }

    private load(): void {
        let profilesChanged = false;
        try {
            const raw = localStorage.getItem(ProfileManager.PROFILES_KEY);
            if (raw) {
                this.profiles = JSON.parse(raw);
            }
        } catch {
            this.profiles = [];
        }

        const familyId = this.getOrCreateFamilyId();
        this.profiles = this.profiles.map(profile => {
            if (profile.childId && profile.familyId) {
                return profile;
            }

            profilesChanged = true;
            return {
                ...profile,
                childId: profile.childId || this.generateId('child'),
                familyId: profile.familyId || familyId,
            };
        });

        try {
            this.activeUser = localStorage.getItem(ProfileManager.ACTIVE_KEY);
        } catch {
            this.activeUser = null;
        }

        if (profilesChanged) {
            this.save();
        }
    }

    private save(): void {
        try {
            localStorage.setItem(ProfileManager.PROFILES_KEY, JSON.stringify(this.profiles));
        } catch {
            console.warn('[ProfileManager] Failed to save profiles');
        }
    }

    private getOrCreateFamilyId(): string {
        try {
            const existing = localStorage.getItem(ProfileManager.FAMILY_KEY);
            if (existing) {
                return existing;
            }

            const next = this.generateId('family');
            localStorage.setItem(ProfileManager.FAMILY_KEY, next);
            return next;
        } catch {
            return 'family-local';
        }
    }

    private generateId(prefix: string): string {
        if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
            return `${prefix}-${crypto.randomUUID()}`;
        }
        return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    }
}
