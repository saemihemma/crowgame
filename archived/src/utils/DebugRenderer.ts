/**
 * DebugRenderer - Visual debug tools for development
 *
 * Features:
 * - Collision box overlay (F3)
 * - Physics velocity vectors (F4)
 * - FPS meter (F5)
 * - Entity spawn points (F6)
 * - Coordinate grid (F7)
 */
export class DebugRenderer {
    private scene: Phaser.Scene;
    private enabled: boolean = false;
    private graphics: Phaser.GameObjects.Graphics | null = null;
    private fpsText: Phaser.GameObjects.Text | null = null;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.graphics = scene.add.graphics().setDepth(1000);

        // FPS meter
        this.fpsText = scene.add.text(10, 10, 'FPS: 60', {
            fontSize: '16px',
            fontFamily: 'monospace',
            color: '#00ff00',
            backgroundColor: '#000000',
            padding: { x: 4, y: 4 },
        }).setScrollFactor(0).setDepth(1001).setVisible(false);
    }

    toggle(): void {
        this.enabled = !this.enabled;
        if (!this.enabled) {
            this.graphics?.clear();
            this.fpsText?.setVisible(false);
        } else {
            this.fpsText?.setVisible(true);
        }
    }

    isEnabled(): boolean {
        return this.enabled;
    }

    update(): void {
        if (!this.enabled || !this.graphics) return;

        this.graphics.clear();

        // Update FPS
        if (this.fpsText) {
            this.fpsText.setText(`FPS: ${Math.round(this.scene.game.loop.actualFps)}`);
        }
    }

    /**
     * Draw collision boxes around physics bodies
     */
    drawCollisionBoxes(bodies: Phaser.Physics.Arcade.Body[]): void {
        if (!this.enabled || !this.graphics) return;

        this.graphics.lineStyle(2, 0x00ff00, 0.8);
        for (const body of bodies) {
            this.graphics.strokeRect(
                body.x - this.scene.cameras.main.scrollX,
                body.y - this.scene.cameras.main.scrollY,
                body.width,
                body.height
            );
        }
    }

    /**
     * Draw velocity vectors
     */
    drawVelocityVector(body: Phaser.Physics.Arcade.Body): void {
        if (!this.enabled || !this.graphics) return;

        const x = body.center.x - this.scene.cameras.main.scrollX;
        const y = body.center.y - this.scene.cameras.main.scrollY;
        const vx = body.velocity.x / 10;
        const vy = body.velocity.y / 10;

        this.graphics.lineStyle(3, 0xff00ff, 1);
        this.graphics.beginPath();
        this.graphics.moveTo(x, y);
        this.graphics.lineTo(x + vx, y + vy);
        this.graphics.strokePath();

        // Arrowhead
        this.graphics.fillStyle(0xff00ff, 1);
        this.graphics.fillCircle(x + vx, y + vy, 3);
    }

    /**
     * Draw coordinate grid
     */
    drawGrid(tileSize: number = 32): void {
        if (!this.enabled || !this.graphics) return;

        const cam = this.scene.cameras.main;
        const startX = Math.floor(cam.scrollX / tileSize) * tileSize;
        const startY = Math.floor(cam.scrollY / tileSize) * tileSize;
        const endX = startX + cam.width + tileSize;
        const endY = startY + cam.height + tileSize;

        this.graphics.lineStyle(1, 0xffffff, 0.1);

        // Vertical lines
        for (let x = startX; x < endX; x += tileSize) {
            this.graphics.beginPath();
            this.graphics.moveTo(x - cam.scrollX, startY - cam.scrollY);
            this.graphics.lineTo(x - cam.scrollX, endY - cam.scrollY);
            this.graphics.strokePath();
        }

        // Horizontal lines
        for (let y = startY; y < endY; y += tileSize) {
            this.graphics.beginPath();
            this.graphics.moveTo(startX - cam.scrollX, y - cam.scrollY);
            this.graphics.lineTo(endX - cam.scrollX, y - cam.scrollY);
            this.graphics.strokePath();
        }
    }

    destroy(): void {
        this.graphics?.destroy();
        this.fpsText?.destroy();
    }
}
