import { ThemeManager } from '../theme/ThemeManager';
import type { ThemeHUD } from '../theme/ThemeTypes';
import { THEME_CHANGED } from '../theme/ThemeManager';
import { EventBus } from '../../utils/EventBus';

/**
 * Themed health bar displaying N icons (feathers, batteries, etc.).
 * Listens to PLAYER_HURT / PLAYER_HEAL events via EventBus.
 */
export class HealthBar {
    private scene: Phaser.Scene;
    private icons: Phaser.GameObjects.Image[] = [];
    private container: Phaser.GameObjects.Container;
    private currentHealth: number;
    private maxHealth: number;

    private x: number;
    private y: number;

    constructor(scene: Phaser.Scene, x: number, y: number) {
        this.scene = scene;
        this.x = x;
        this.y = y;
        this.container = scene.add.container(x, y).setScrollFactor(0).setDepth(200);

        const hudConfig = ThemeManager.getInstance().getConfig('hud') as ThemeHUD;
        this.maxHealth = hudConfig.healthMax;
        this.currentHealth = this.maxHealth;

        this.buildIcons();

        // Listen for theme changes to rebuild
        EventBus.on(THEME_CHANGED, this.onThemeChanged, this);
        EventBus.on('player-hurt', this.onHurt, this);
        EventBus.on('player-heal', this.onHeal, this);
    }

    private buildIcons(): void {
        // Clear existing
        this.icons.forEach(i => i.destroy());
        this.icons = [];

        const tm = ThemeManager.getInstance();
        const iconKey = tm.getSprite('hud', 'healthIcon');
        const hasTexture = this.scene.textures.exists(iconKey);

        for (let i = 0; i < this.maxHealth; i++) {
            let icon: Phaser.GameObjects.Image;
            if (hasTexture) {
                icon = this.scene.add.image(i * 48, 0, iconKey);
            } else {
                icon = this.createPlaceholderIcon(i);
                icon.setPosition(i * 48, 0);
            }
            icon.setOrigin(0, 0);
            this.container.add(icon);
            this.icons.push(icon);
        }

        this.refreshDisplay();
    }

    private createPlaceholderIcon(_index: number): Phaser.GameObjects.Image {
        const tm = ThemeManager.getInstance();
        const color = tm.getColorNum('danger');

        // Use a graphics object to create a heart-shaped placeholder texture
        const key = `health_icon_placeholder_${tm.getActiveThemeId()}`;
        if (!this.scene.textures.exists(key)) {
            const w = 44;
            const h = 48;
            // The heart shape, as pixel rows at 2x. Declared once so the ink
            // outline can be a true dilation of it rather than a guess.
            const rows: ReadonlyArray<readonly [number, number, number, number]> = [
                [4, 0, 12, 8], [24, 0, 12, 8], [0, 4, 40, 16],
                [4, 20, 32, 8], [8, 28, 24, 4], [12, 32, 16, 4], [16, 36, 8, 4],
            ];

            const gfx = this.scene.add.graphics();

            // Outline: stamp the silhouette at four offsets, which dilates it by
            // 2px on every side. Stamping a single shifted copy - which the first
            // build did - leaves a notch on the un-offset corner.
            // brand/BRAND_SYSTEM.md section 5.3 requires the outline; without it
            // the hearts disappear on a bright world.
            gfx.fillStyle(tm.getColorNum('ink'), 1);
            for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) {
                for (const [x, y, w2, h2] of rows) {
                    gfx.fillRect(x + dx + 2, y + dy + 2, w2, h2);
                }
            }

            gfx.fillStyle(color, 1);
            for (const [x, y, w2, h2] of rows) {
                gfx.fillRect(x + 2, y + 2, w2, h2);
            }
            // Highlight on left bump
            gfx.fillStyle(0xffffff, 0.35);
            gfx.fillRect(6, 2, 6, 4);
            gfx.fillRect(4, 6, 4, 6);
            gfx.generateTexture(key, w, h);
            gfx.destroy();
        }
        return this.scene.add.image(0, 0, key);
    }

    private refreshDisplay(): void {
        for (let i = 0; i < this.icons.length; i++) {
            const active = i < this.currentHealth;
            this.icons[i].setAlpha(active ? 1 : 0.25);
            this.icons[i].setTint(active ? 0xffffff : 0x555555);
        }
    }

    private onHurt = (): void => {
        if (!this.scene || !this.scene.sys.isActive()) return;
        if (this.currentHealth <= 0) return;
        this.currentHealth--;

        const lostIcon = this.icons[this.currentHealth];
        if (lostIcon) {
            // Shake + fade animation
            this.scene.tweens.add({
                targets: lostIcon,
                x: lostIcon.x + 4,
                duration: 40,
                yoyo: true,
                repeat: 3,
                onComplete: () => {
                    this.scene.tweens.add({
                        targets: lostIcon,
                        alpha: 0.25,
                        duration: 200,
                        onComplete: () => lostIcon.setTint(0x555555),
                    });
                },
            });
        }
    };

    private onHeal = (): void => {
        if (!this.scene || !this.scene.sys.isActive()) return;
        if (this.currentHealth >= this.maxHealth) return;
        const healedIcon = this.icons[this.currentHealth];
        this.currentHealth++;

        if (healedIcon) {
            healedIcon.setAlpha(1);
            healedIcon.setTint(0xffffff);
            // Pop animation
            this.scene.tweens.add({
                targets: healedIcon,
                scaleX: 1.5,
                scaleY: 1.5,
                duration: 100,
                yoyo: true,
                ease: 'Back.easeOut',
            });
        }
    };

    private onThemeChanged = (): void => {
        const hudConfig = ThemeManager.getInstance().getConfig('hud') as ThemeHUD;
        this.maxHealth = hudConfig.healthMax;
        if (this.currentHealth > this.maxHealth) this.currentHealth = this.maxHealth;
        this.buildIcons();
    };

    setHealth(value: number): void {
        this.currentHealth = Math.max(0, Math.min(value, this.maxHealth));
        this.refreshDisplay();
    }

    destroy(): void {
        EventBus.off(THEME_CHANGED, this.onThemeChanged, this);
        EventBus.off('player-hurt', this.onHurt, this);
        EventBus.off('player-heal', this.onHeal, this);
        this.container.destroy(true);
    }
}
