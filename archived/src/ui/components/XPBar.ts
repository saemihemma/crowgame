import { EventBus, GameEvents } from '../../utils/EventBus';
import { LevelingManager } from '../../systems/LevelingManager';
import { DopamineFX } from '../fx/DopamineFX';

/**
 * XP progress bar + level number display for the HUD.
 * Shows: Lv.N [====----] xp/needed
 */
export class XPBar {
    private scene: Phaser.Scene;
    private container: Phaser.GameObjects.Container;
    private levelText!: Phaser.GameObjects.Text;
    private barBg!: Phaser.GameObjects.Graphics;
    private barFill!: Phaser.GameObjects.Graphics;
    private xpText!: Phaser.GameObjects.Text;

    private readonly barW = 120;
    private readonly barH = 12;

    constructor(scene: Phaser.Scene, x: number, y: number) {
        this.scene = scene;
        this.container = scene.add.container(x, y).setScrollFactor(0).setDepth(200);

        this.build();

        EventBus.on(GameEvents.XP_CHANGED, this.onXPChanged, this);
        EventBus.on(GameEvents.LEVEL_UP, this.onLevelUp, this);
    }

    private build(): void {
        const lm = LevelingManager.getInstance();

        // Level label
        this.levelText = this.scene.add.text(0, 0, `Lv.${lm.getPlayerLevel()}`, {
            fontSize: '16px',
            fontFamily: 'monospace',
            color: '#ffd700',
            stroke: '#000000',
            strokeThickness: 3,
        }).setOrigin(0, 0.5);
        this.container.add(this.levelText);

        // Bar background
        const barX = 56;
        this.barBg = this.scene.add.graphics();
        this.barBg.fillStyle(0x333333, 0.8);
        this.barBg.fillRect(barX, -this.barH / 2, this.barW, this.barH);
        this.barBg.lineStyle(1, 0x666666, 0.8);
        this.barBg.strokeRect(barX, -this.barH / 2, this.barW, this.barH);
        this.container.add(this.barBg);

        // Bar fill
        this.barFill = this.scene.add.graphics();
        this.container.add(this.barFill);

        // XP count text
        this.xpText = this.scene.add.text(barX + this.barW + 8, 0, '', {
            fontSize: '14px',
            fontFamily: 'monospace',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 2,
        }).setOrigin(0, 0.5);
        this.container.add(this.xpText);

        // Delay initial refresh to ensure graphics context is ready
        this.scene.time.delayedCall(0, () => {
            this.refresh();
        });
    }

    private refresh(): void {
        // Guard: ensure scene is active and objects are initialized and active
        if (!this.scene?.sys.isActive() || !this.barFill || !this.levelText || !this.xpText) {
            return;
        }

        // Additional check: ensure graphics objects are still active (not destroyed)
        if (!this.barFill.active || !this.levelText.active || !this.xpText.active) {
            return;
        }

        // Check if container is still valid
        if (!this.container || !this.container.active) {
            return;
        }

        const lm = LevelingManager.getInstance();
        const xp = lm.getXPProgress() || 0;
        const needed = lm.getXPForCurrentLevel() || 10;
        const pct = needed > 0 ? Math.min(xp / needed, 1) : 0;

        try {
            this.levelText.setText(`Lv.${lm.getPlayerLevel() ?? 1}`);
            this.xpText.setText(`${xp}/${needed}`);

            const barX = 56;
            this.barFill.clear();
            this.barFill.fillStyle(0xffd700, 1);
            this.barFill.fillRect(barX + 1, -this.barH / 2 + 1, (this.barW - 2) * pct, this.barH - 2);
        } catch (e) {
            // Silently fail if graphics context is invalid (scene was destroyed)
            console.warn('XPBar.refresh: graphics context invalid', e);
        }
    }

    private onXPChanged = (): void => {
        if (!this.scene?.sys.isActive() || !this.container?.active) return;
        this.refresh();
    };

    private onLevelUp = (data: { level: number }): void => {
        if (!this.scene?.sys.isActive() || !this.container?.active) return;
        this.refresh();

        // Level up celebration
        if (this.container && this.container.active) {
            DopamineFX.celebrationBurst(this.scene, this.container.x + 100, this.container.y);
            DopamineFX.numberFlyUp(
                this.scene,
                this.container.x + 100,
                this.container.y - 20,
                `Level ${data.level}!`,
                '#ffd700',
                0,
            );
        }
    };

    destroy(): void {
        EventBus.off(GameEvents.XP_CHANGED, this.onXPChanged, this);
        EventBus.off(GameEvents.LEVEL_UP, this.onLevelUp, this);
        this.container.destroy(true);
    }
}
