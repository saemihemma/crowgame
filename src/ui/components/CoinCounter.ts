import { ThemeManager, THEME_CHANGED } from '../theme/ThemeManager';
import { EventBus, GameEvents } from '../../utils/EventBus';
import { TextManager } from '../../systems/TextManager';

/**
 * Themed coin counter with bounce and fly-up animations.
 * Uses the first frame of the coin spritesheet as the icon.
 * Listens to COINS_CHANGED events via EventBus.
 */
export class CoinCounter {
    private scene: Phaser.Scene;
    private container: Phaser.GameObjects.Container;
    private icon: Phaser.GameObjects.Image | null = null;
    private countText: Phaser.GameObjects.Text;
    private currentCount = 0;

    constructor(scene: Phaser.Scene, x: number, y: number) {
        this.scene = scene;
        this.container = scene.add.container(x, y).setScrollFactor(0).setDepth(200);

        // Build icon
        this.buildIcon();

        // Count text
        const tm = ThemeManager.getInstance();
        const tt = TextManager.getInstance();
        this.countText = scene.add.text(36, -2, tt.t('hud.coins', 0), {
            fontSize: '28px',
            fontFamily: tm.getTheme().hud.font || 'monospace',
            color: tm.getColor('accent'),
            stroke: tm.getColor('textShadow'),
            strokeThickness: 3,
        });
        this.container.add(this.countText);

        // Listen for events
        EventBus.on(GameEvents.COINS_CHANGED, this.onCoinsChanged, this);
        EventBus.on(THEME_CHANGED, this.onThemeChanged, this);
    }

    private buildIcon(): void {
        if (this.icon) {
            this.icon.destroy();
            this.icon = null;
        }

        // Use frame 0 of the gameplay-sized coin spritesheet.
        if (this.scene.textures.exists('coin')) {
            this.icon = this.scene.add.image(0, 0, 'coin', 0).setOrigin(0, 0);
            this.icon.setDisplaySize(24, 24);
        } else {
            // Placeholder coin icon
            const tm = ThemeManager.getInstance();
            const key = `coin_hud_placeholder_${tm.getActiveThemeId()}`;
            if (!this.scene.textures.exists(key)) {
                const gfx = this.scene.add.graphics();
                const accentColor = tm.getColorNum('accent');
                gfx.fillStyle(accentColor, 1);
                gfx.fillCircle(14, 14, 14);
                gfx.fillStyle(0xffffff, 0.3);
                gfx.fillCircle(10, 10, 6);
                gfx.generateTexture(key, 28, 28);
                gfx.destroy();
            }
            this.icon = this.scene.add.image(0, 0, key).setOrigin(0, 0);
        }
        this.container.addAt(this.icon, 0);
    }

    private onCoinsChanged = (count: number): void => {
        // Guard: scene or text may have been destroyed during a level transition
        if (!this.scene?.sys?.isActive() || !this.countText?.active) return;

        const diff = count - this.currentCount;
        this.currentCount = count;
        const tt = TextManager.getInstance();
        this.countText.setText(tt.t('hud.coins', count));

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

        // Fly-up "+N" text
        if (diff > 0) {
            const tt2 = TextManager.getInstance();
            const flyText = this.scene.add.text(
                this.container.x + 60,
                this.container.y - 10,
                tt2.t('hud.coins_plus', diff),
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
        }

        // Milestone burst at 10, 25, 50
        if ([10, 25, 50, 100].includes(count)) {
            this.playMilestoneBurst();
        }
    };

    private playMilestoneBurst(): void {
        const tm = ThemeManager.getInstance();
        const tt = TextManager.getInstance();
        const milestoneText = this.scene.add.text(
            this.container.x + 20,
            this.container.y - 30,
            tt.t('hud.coins_milestone', this.currentCount),
            {
                fontSize: '32px',
                fontFamily: 'monospace',
                color: tm.getColor('accent'),
                stroke: '#000000',
                strokeThickness: 4,
            },
        ).setScrollFactor(0).setDepth(220).setOrigin(0.5, 1);

        this.scene.tweens.add({
            targets: milestoneText,
            scaleX: 1.3,
            scaleY: 1.3,
            duration: 200,
            yoyo: true,
            ease: 'Back.easeOut',
            onComplete: () => {
                this.scene.tweens.add({
                    targets: milestoneText,
                    y: milestoneText.y - 60,
                    alpha: 0,
                    duration: 800,
                    onComplete: () => milestoneText.destroy(),
                });
            },
        });
    }

    private onThemeChanged = (): void => {
        this.buildIcon();
        const tm = ThemeManager.getInstance();
        this.countText.setColor(tm.getColor('accent'));
        this.countText.setStroke(tm.getColor('textShadow'), 2);
    };

    setCount(value: number): void {
        this.currentCount = value;
        const tt = TextManager.getInstance();
        this.countText.setText(tt.t('hud.coins', value));
    }

    destroy(): void {
        EventBus.off(GameEvents.COINS_CHANGED, this.onCoinsChanged, this);
        EventBus.off(THEME_CHANGED, this.onThemeChanged, this);
        this.container.destroy(true);
    }
}
