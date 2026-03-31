import Phaser from 'phaser';
import { GAME_WIDTH } from '../utils/Constants';

export class Projectile {
    public sprite: Phaser.Physics.Arcade.Sprite;
    private scene: Phaser.Scene;
    private lifetime: number;
    private trailTimer: number = 0;

    constructor(scene: Phaser.Scene, x: number, y: number, direction: number, speed = 300) {
        this.scene = scene;
        // Lifetime: enough to traverse the full screen width
        this.lifetime = (GAME_WIDTH / speed) * 1000;

        // Create the laser texture if it doesn't exist
        const key = 'laser_beam';
        if (!scene.textures.exists(key)) {
            const gfx = scene.add.graphics();
            // Red/orange laser beam (2× size)
            gfx.fillStyle(0xff2200, 1);
            gfx.fillRect(0, 4, 24, 8);
            // Bright core
            gfx.fillStyle(0xffaa00, 1);
            gfx.fillRect(2, 6, 20, 4);
            // Tip glow
            gfx.fillStyle(0xffff66, 1);
            gfx.fillRect(20, 6, 6, 4);
            gfx.generateTexture(key, 28, 16);
            gfx.destroy();
        }

        this.sprite = scene.physics.add.sprite(x, y, key);
        this.sprite.setFlipX(direction < 0);
        (this.sprite.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
        (this.sprite.body as Phaser.Physics.Arcade.Body).setVelocityX(direction * speed);
        this.sprite.setDepth(10);
        this.sprite.setData('projectile', this);
    }

    update(delta: number): boolean {
        this.lifetime -= delta;
        if (this.lifetime <= 0) {
            this.destroy();
            return false;
        }

        // Spawn trail particles every 30ms
        this.trailTimer += delta;
        if (this.trailTimer >= 30) {
            this.trailTimer = 0;
            this.spawnTrailParticle();
        }

        return true;
    }

    private spawnTrailParticle(): void {
        const x = this.sprite.x - (this.sprite.flipX ? -10 : 10);
        const y = this.sprite.y;

        const trail = this.scene.add.circle(
            x, y, 3 + Math.random() * 2,
            0xffaa00, 0.8,
        ).setDepth(9);

        this.scene.tweens.add({
            targets: trail,
            alpha: 0,
            scaleX: 0.1,
            scaleY: 0.1,
            duration: 200,
            onComplete: () => trail.destroy(),
        });
    }

    destroy(): void {
        this.sprite.destroy();
    }
}
