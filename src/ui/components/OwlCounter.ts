import { ThemeManager, THEME_CHANGED } from '../theme/ThemeManager';
import { EventBus, GameEvents } from '../../utils/EventBus';
import { TextManager } from '../../systems/TextManager';

/**
 * Owl counter for the HUD — shows total owls saved.
 * Uses the owl sprite as icon (auto-updates if sprite is replaced).
 * Listens to OWL_SAVED events via EventBus.
 */
export class OwlCounter {
    private scene: Phaser.Scene;
    private container: Phaser.GameObjects.Container;
    private icon: Phaser.GameObjects.Image | null = null;
    private countText: Phaser.GameObjects.Text;
    private currentCount = 0;

    constructor(scene: Phaser.Scene, x: number, y: number) {
        this.scene = scene;
        this.container = scene.add.container(x, y).setScrollFactor(0).setDepth(200);

        // Build owl icon
        this.buildIcon();

        // Count text
        const tm = ThemeManager.getInstance();
        const tt = TextManager.getInstance();
        this.countText = scene.add.text(36, -2, tt.t('hud.owls', 0), {
            fontSize: '28px',
            fontFamily: tm.getTheme().hud.font || 'monospace',
            color: tm.getColor('accent'),
            stroke: tm.getColor('textShadow'),
            strokeThickness: 3,
        });
        this.container.add(this.countText);

        // Listen for events
        EventBus.on(GameEvents.OWL_SAVED, this.onOwlSaved, this);
        EventBus.on(THEME_CHANGED, this.onThemeChanged, this);
    }

    private buildIcon(): void {
        if (this.icon) {
            this.icon.destroy();
            this.icon = null;
        }

        // Use the gameplay-sized owl texture directly.
        if (this.scene.textures.exists('owl')) {
            this.icon = this.scene.add.image(0, 0, 'owl').setOrigin(0, 0);
            this.icon.setDisplaySize(24, 24);
        } else {
            // Placeholder owl icon
            const key = 'owl_hud_placeholder';
            if (!this.scene.textures.exists(key)) {
                const gfx = this.scene.add.graphics();
                gfx.fillStyle(0x8B4513, 1);
                gfx.fillCircle(14, 14, 14);
                gfx.fillStyle(0xFFD700, 1);
                gfx.fillCircle(9, 10, 4);
                gfx.fillCircle(19, 10, 4);
                gfx.generateTexture(key, 28, 28);
                gfx.destroy();
            }
            this.icon = this.scene.add.image(0, 0, key).setOrigin(0, 0);
        }
        this.container.addAt(this.icon, 0);
    }

    private onOwlSaved = (): void => {
        if (!this.scene?.sys?.isActive() || !this.countText?.active) return;

        this.currentCount++;
        const tt = TextManager.getInstance();
        this.countText.setText(tt.t('hud.owls', this.currentCount));

        // Icon bounce
        if (this.icon) {
            this.scene.tweens.add({
                targets: this.icon,
                scaleX: 1.4,
                scaleY: 1.4,
                duration: 80,
                yoyo: true,
                ease: 'Back.easeOut',
            });
        }

        // Fly-up "+1" text
        const flyText = this.scene.add.text(
            this.container.x + 60,
            this.container.y - 10,
            '+1',
            {
                fontSize: '24px',
                fontFamily: 'monospace',
                color: ThemeManager.getInstance().getColor('accent'),
                stroke: '#000000',
                strokeThickness: 3,
            },
        ).setScrollFactor(0).setDepth(210);

        this.scene.tweens.add({
            targets: flyText,
            y: flyText.y - 40,
            alpha: 0,
            duration: 600,
            ease: 'Power2',
            onComplete: () => flyText.destroy(),
        });
    };

    private onThemeChanged = (): void => {
        this.buildIcon();
        const tm = ThemeManager.getInstance();
        this.countText.setColor(tm.getColor('accent'));
        this.countText.setStroke(tm.getColor('textShadow'), 2);
    };

    setCount(value: number): void {
        this.currentCount = value;
        const tt = TextManager.getInstance();
        this.countText.setText(tt.t('hud.owls', value));
    }

    destroy(): void {
        EventBus.off(GameEvents.OWL_SAVED, this.onOwlSaved, this);
        EventBus.off(THEME_CHANGED, this.onThemeChanged, this);
        this.container.destroy(true);
    }
}
