/**
 * Pulsing orange outline that highlights the currently focused UI element.
 * Used by UINavigator for keyboard navigation.
 */
export class FocusHighlight {
    private scene: Phaser.Scene;
    private graphics: Phaser.GameObjects.Graphics;
    private pulseTween: Phaser.Tweens.Tween | null = null;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.graphics = scene.add.graphics().setDepth(500).setVisible(false);
    }

    show(x: number, y: number, w: number, h: number): void {
        const color = 0xff8800; // orange

        this.graphics.clear();
        this.graphics.lineStyle(3, color, 1);
        this.graphics.strokeRoundedRect(x - w / 2 - 4, y - h / 2 - 4, w + 8, h + 8, 12);
        this.graphics.setVisible(true);
        this.graphics.setAlpha(1);

        // Start pulse if not already running
        if (!this.pulseTween || !this.pulseTween.isPlaying()) {
            this.pulseTween = this.scene.tweens.add({
                targets: this.graphics,
                alpha: { from: 1, to: 0.4 },
                duration: 600,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
            });
        }
    }

    hide(): void {
        this.graphics.setVisible(false);
        this.graphics.clear();
        if (this.pulseTween) {
            this.pulseTween.stop();
            this.pulseTween = null;
        }
    }

    destroy(): void {
        this.hide();
        this.graphics.destroy();
    }
}
