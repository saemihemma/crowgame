/**
 * Audio item definition from manifest
 */
export interface AudioItem {
    key: string;
    file: string;
    volume: number;
    loop?: boolean;
    pool?: number; // Number of instances to pool for frequent SFX
}

/**
 * Audio manifest structure
 */
export interface AudioManifest {
    sfx: Record<string, Omit<AudioItem, 'key'>>;
    music: Record<string, Omit<AudioItem, 'key'>>;
}

/**
 * AudioManager - Singleton for centralized audio loading, playback, and volume control
 *
 * Features:
 * - Separate volume controls for master, SFX, and music
 * - Audio pooling for frequently played sounds
 * - Cross-fade support for music transitions
 * - Graceful fallback when audio files don't exist (silent mode)
 *
 * Usage:
 *   AudioManager.getInstance().playSFX('coin_collect');
 *   AudioManager.getInstance().playMusic('forest_theme');
 *   AudioManager.getInstance().setMasterVolume(0.8);
 */
export class AudioManager {
    private static instance: AudioManager;
    private scene: Phaser.Scene | null = null;
    private manifest: AudioManifest | null = null;

    // Volume controls (0.0 to 1.0)
    private static readonly MUTE_KEY = 'crow_sound_muted';
    private muted = false;
    private masterVolume = 1.0;
    private sfxVolume = 1.0;
    private musicVolume = 1.0;

    // Audio pools for frequently played SFX
    private audioPools: Map<string, Phaser.Sound.BaseSound[]> = new Map();

    // Currently playing music track
    private currentMusic: Phaser.Sound.BaseSound | null = null;
    private currentMusicKey: string | null = null;

    // Silent mode (when audio files don't exist)
    private silentMode = false;

    private constructor() {
        // Private constructor for singleton
    }

    public static getInstance(): AudioManager {
        if (!AudioManager.instance) {
            AudioManager.instance = new AudioManager();
        }
        return AudioManager.instance;
    }

    /**
     * Initialize AudioManager with scene and manifest
     */
    public init(scene: Phaser.Scene, manifest: AudioManifest): void {
        this.scene = scene;
        this.manifest = manifest;

        // Create audio pools for frequently played SFX
        this.createAudioPools();

        console.log('[AudioManager] Initialized with', Object.keys(manifest.sfx).length, 'SFX and', Object.keys(manifest.music).length, 'music tracks');
    }

    /**
     * Create audio pools for SFX that have pool > 1
     */
    private createAudioPools(): void {
        if (!this.scene || !this.manifest) return;

        for (const [key, config] of Object.entries(this.manifest.sfx)) {
            if (config.pool && config.pool > 1) {
                const pool: Phaser.Sound.BaseSound[] = [];

                for (let i = 0; i < config.pool; i++) {
                    // Check if audio exists before adding
                    if (this.scene.cache.audio.exists(key)) {
                        const sound = this.scene.sound.add(key, { volume: config.volume * this.sfxVolume * this.masterVolume });
                        pool.push(sound);
                    }
                }

                if (pool.length > 0) {
                    this.audioPools.set(key, pool);
                    console.log('[AudioManager] Created pool for', key, 'with', pool.length, 'instances');
                }
            }
        }
    }

    /**
     * Play a sound effect
     * @param key - SFX key from manifest
     * @param volumeOverride - Optional volume override (0.0 to 1.0)
     */
    public playSFX(key: string, volumeOverride?: number): void {
        if (!this.scene || this.silentMode || this.muted) return;

        // Check if we have a pool for this sound
        const pool = this.audioPools.get(key);
        if (pool) {
            // Find first non-playing sound in pool
            const available = pool.find(sound => !sound.isPlaying);
            if (available) {
                const volume = volumeOverride ?? (this.manifest?.sfx[key]?.volume ?? 1.0);
                (available as any).setVolume(volume * this.sfxVolume * this.masterVolume);
                available.play();
                return;
            }
            // All pooled sounds are playing, skip
            return;
        }

        // No pool, play directly if audio exists
        if (this.scene.cache.audio.exists(key)) {
            const volume = volumeOverride ?? (this.manifest?.sfx[key]?.volume ?? 1.0);
            const sound = this.scene.sound.add(key, {
                volume: volume * this.sfxVolume * this.masterVolume
            });
            sound.play();
            // Auto-destroy when complete to free memory
            sound.once('complete', () => sound.destroy());
        }

        // Audio doesn't exist, silent fallback (no error)
    }

    /**
     * Play music track with optional cross-fade
     * @param key - Music key from manifest
     * @param crossFadeDuration - Duration in ms for cross-fade (0 = instant)
     */
    public playMusic(key: string, crossFadeDuration: number = 500): void {
        if (!this.scene || this.silentMode || this.muted) return;

        // Clear stale references (e.g. after scene restart destroys sound objects)
        if (this.currentMusic && !this.currentMusic.isPlaying) {
            this.currentMusic = null;
            this.currentMusicKey = null;
        }

        // If same music already playing, do nothing
        if (this.currentMusicKey === key && this.currentMusic?.isPlaying) {
            return;
        }

        // Check if music exists
        if (!this.scene.cache.audio.exists(key)) {
            console.warn('[AudioManager] Music track not found:', key);
            return;
        }

        const config = this.manifest?.music[key];
        if (!config) return;

        const targetVolume = config.volume * this.musicVolume * this.masterVolume;

        // Handle cross-fade if there's currently playing music
        if (this.currentMusic && this.currentMusic.isPlaying && crossFadeDuration > 0) {
            // Fade out current music
            this.scene.tweens.add({
                targets: this.currentMusic,
                volume: 0,
                duration: crossFadeDuration,
                ease: 'Linear',
                onComplete: () => {
                    this.currentMusic?.stop();
                    this.currentMusic?.destroy();
                },
            });

            // Start new music at 0 volume and fade in
            const newMusic = this.scene.sound.add(key, {
                loop: config.loop ?? true,
                volume: 0,
            });
            newMusic.play();

            this.scene.tweens.add({
                targets: newMusic,
                volume: targetVolume,
                duration: crossFadeDuration,
                ease: 'Linear',
            });

            this.currentMusic = newMusic;
            this.currentMusicKey = key;
        } else {
            // No cross-fade, just stop current and play new
            if (this.currentMusic) {
                this.currentMusic.stop();
                this.currentMusic.destroy();
            }

            const newMusic = this.scene.sound.add(key, {
                loop: config.loop ?? true,
                volume: targetVolume,
            });
            newMusic.play();

            this.currentMusic = newMusic;
            this.currentMusicKey = key;
        }

        console.log('[AudioManager] Playing music:', key);
    }

    /**
     * Stop currently playing music
     * @param fadeDuration - Duration in ms for fade-out (0 = instant)
     */
    public stopMusic(fadeDuration: number = 500): void {
        if (!this.currentMusic || !this.scene) return;

        if (fadeDuration > 0 && this.currentMusic.isPlaying) {
            this.scene.tweens.add({
                targets: this.currentMusic,
                volume: 0,
                duration: fadeDuration,
                ease: 'Linear',
                onComplete: () => {
                    this.currentMusic?.stop();
                    this.currentMusic?.destroy();
                    this.currentMusic = null;
                    this.currentMusicKey = null;
                },
            });
        } else {
            this.currentMusic.stop();
            this.currentMusic.destroy();
            this.currentMusic = null;
            this.currentMusicKey = null;
        }
    }

    /**
     * Mute or unmute everything, and remember the choice.
     *
     * The volume API below has existed since the audio system was written and
     * nothing has ever called it -- there was no way for a player to turn the
     * sound down. A game a child plays in a car, a waiting room or a classroom
     * needs one, and it has to survive a reload, so the choice is persisted under
     * `crow_sound` beside `crow_locale`.
     *
     * Mute is a separate flag rather than "master volume 0" so unmuting restores
     * whatever the volume was, and so a future volume slider does not have to
     * guess whether zero meant muted or turned all the way down.
     */
    public setMuted(muted: boolean): void {
        this.muted = muted;
        try {
            localStorage.setItem(AudioManager.MUTE_KEY, muted ? '1' : '0');
        } catch {
            // Private mode or blocked storage: the choice still applies to this
            // session, it just will not survive a reload.
        }
        if (this.currentMusic && this.currentMusicKey) {
            const config = this.manifest?.music[this.currentMusicKey];
            if (config) {
                (this.currentMusic as unknown as { setVolume: (v: number) => void }).setVolume(
                    muted ? 0 : config.volume * this.musicVolume * this.masterVolume,
                );
            }
        }
    }

    public isMuted(): boolean {
        return this.muted;
    }

    /** Restore the stored choice. Called once during boot. */
    public loadMutePreference(): void {
        try {
            this.muted = localStorage.getItem(AudioManager.MUTE_KEY) === '1';
        } catch {
            this.muted = false;
        }
    }

    /**
     * Set master volume (affects all audio)
     */
    public setMasterVolume(volume: number): void {
        this.masterVolume = Math.max(0, Math.min(1, volume));
    }

    /**
     * Set SFX volume
     */
    public setSFXVolume(volume: number): void {
        this.sfxVolume = Math.max(0, Math.min(1, volume));
    }

    /**
     * Set music volume
     */
    public setMusicVolume(volume: number): void {
        this.musicVolume = Math.max(0, Math.min(1, volume));
        if (this.currentMusic && this.currentMusicKey) {
            const config = this.manifest?.music[this.currentMusicKey];
            if (config) {
                (this.currentMusic as any).setVolume(config.volume * this.musicVolume * this.masterVolume);
            }
        }
    }

    /**
     * Get current master volume
     */
    public getMasterVolume(): number {
        return this.masterVolume;
    }

    /**
     * Get current SFX volume
     */
    public getSFXVolume(): number {
        return this.sfxVolume;
    }

    /**
     * Get current music volume
     */
    public getMusicVolume(): number {
        return this.musicVolume;
    }

    /**
     * Enable silent mode (no audio playback)
     */
    public setSilentMode(silent: boolean): void {
        this.silentMode = silent;
        if (silent) {
            this.stopMusic(0);
        }
    }

    /**
     * Check if silent mode is enabled
     */
    public isSilent(): boolean {
        return this.silentMode;
    }

    /**
     * Clean up resources
     */
    public destroy(): void {
        // Stop and destroy current music
        if (this.currentMusic) {
            this.currentMusic.stop();
            this.currentMusic.destroy();
        }

        // Destroy all pooled sounds
        for (const pool of this.audioPools.values()) {
            for (const sound of pool) {
                sound.destroy();
            }
        }

        this.audioPools.clear();
        this.currentMusic = null;
        this.currentMusicKey = null;
        this.scene = null;
        this.manifest = null;
    }
}
