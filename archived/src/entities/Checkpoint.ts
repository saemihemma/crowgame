import Phaser from 'phaser';
import { DopamineFX } from '../ui/fx/DopamineFX';

/**
 * Checkpoint - Save point within a level where player respawns on death
 */
export class Checkpoint {
    public sprite: Phaser.Physics.Arcade.Sprite;
    private scene: Phaser.Scene;
    private activated: boolean = false;
    private id: string;

    constructor(scene: Phaser.Scene, x: number, y: number, id: string) {
        this.scene = scene;
        this.id = id;

        // Create checkpoint visual (flag/torch sprite)
        // For now, use a simple generated texture
        const key = 'checkpoint';
        if (!scene.textures.exists(key)) {
            const gfx = scene.add.graphics();
            // Flag pole
            gfx.fillStyle(0x888888, 1);
            gfx.fillRect(14, 0, 4, 64);
            // Flag
            gfx.fillStyle(0x44ff44, 1);
            gfx.fillTriangle(18, 4, 18, 28, 42, 16);
            gfx.generateTexture(key, 48, 64);
            gfx.destroy();
        }

        this.sprite = scene.physics.add.sprite(x, y, key);
        (this.sprite.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
        (this.sprite.body as Phaser.Physics.Arcade.Body).setImmovable(true);
        this.sprite.setDepth(5);

        // Gentle wave animation for flag
        scene.tweens.add({
            targets: this.sprite,
            angle: -3,
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
    }

    activate(): void {
        if (this.activated) return;
        this.activated = true;

        // Change to activated color
        this.sprite.setTint(0xffd700);

        // Celebration effect
        DopamineFX.celebrationBurst(this.scene, this.sprite.x, this.sprite.y);

        // Play activation sound (if audio exists)
        // AudioManager would be called here if needed

        // Visual feedback - glow pulse
        this.scene.tweens.add({
            targets: this.sprite,
            scaleX: 1.2,
            scaleY: 1.2,
            duration: 200,
            yoyo: true,
            ease: 'Sine.easeInOut',
        });
    }

    isActivated(): boolean {
        return this.activated;
    }

    getId(): string {
        return this.id;
    }

    destroy(): void {
        this.sprite.destroy();
    }
}
