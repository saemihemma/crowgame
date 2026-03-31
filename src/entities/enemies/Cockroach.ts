import { Enemy, type EnemyDefinition } from './Enemy';
import { applyGroundingVisualSink } from '../../utils/applyGroundingVisualSink';

/**
 * Cockroach enemy: patrols back and forth on a platform.
 * Uses npcs/cockroach.png as a static image (no animation).
 *
 * Behavior:
 * 1. Move horizontally at constant speed (definition.speed)
 * 2. Reverse direction when hitting walls (body.blocked.left/right)
 * 3. Reverse direction at platform edges (checkEdge() method)
 * 4. Flip sprite based on direction (setFlipX)
 */
export class Cockroach extends Enemy {
    private direction: 1 | -1 = -1;
    private edgeCheckTimer = 0;
    private readonly EDGE_CHECK_INTERVAL = 100; // ms

    constructor(scene: Phaser.Scene, x: number, y: number, def: EnemyDefinition) {
        super(scene, x, y, def);

        const body = this.sprite.body as Phaser.Physics.Arcade.Body;

        // Gameplay asset is already exported at the intended runtime size.
        body.setSize(48, 56);
        body.setOffset(8, 8);
        applyGroundingVisualSink(this.sprite, 4);

        body.setVelocityX(-def.speed);
        body.setCollideWorldBounds(true);
        body.onWorldBounds = true;

        this.sprite.setFlipX(false);
    }

    update(delta: number): void {
        if (this.isDead()) return;

        const body = this.sprite.body as Phaser.Physics.Arcade.Body;

        // Reverse on wall collision
        if (body.blocked.left) {
            this.direction = 1;
        } else if (body.blocked.right) {
            this.direction = -1;
        }

        // Edge detection: check if there's ground ahead
        this.edgeCheckTimer += delta;
        if (this.edgeCheckTimer >= this.EDGE_CHECK_INTERVAL && body.blocked.down) {
            this.edgeCheckTimer = 0;
            this.checkEdge();
        }

        body.setVelocityX(this.direction * this.definition.speed);
        this.sprite.setFlipX(this.direction < 0);
    }

    private checkEdge(): void {
        // Probe one tile ahead at foot level to see if there's ground
        const probeX = this.sprite.x + this.direction * 28;
        const probeY = this.sprite.y + 24;

        // Use the ground layer to check for tiles (passed via scene data)
        const groundLayer = this.scene.data.get('groundLayer') as Phaser.Tilemaps.TilemapLayer | null;
        if (!groundLayer) return;

        const tile = groundLayer.getTileAtWorldXY(probeX, probeY);
        if (!tile) {
            // No ground ahead — reverse
            this.direction = this.direction === 1 ? -1 : 1;
        }
    }
}
