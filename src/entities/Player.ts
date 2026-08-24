import { PlayerTuning } from '../gameplay/tuning/PlayerTuning';
import { AbilityManager } from '../gameplay/abilities/AbilityManager';
import { AudioManager } from '../systems/AudioManager';
import { DopamineFX } from '../ui/fx/DopamineFX';
import type { InputState, PlayerTuningData } from '../utils/Types';
import { DEFAULT_GRAVITY } from '../utils/Constants';
import { applyGroundingVisualSink } from '../utils/applyGroundingVisualSink';

export class Player {
    public sprite: Phaser.Physics.Arcade.Sprite;
    public tuning: PlayerTuning;
    public abilityManager: AbilityManager;

    private scene: Phaser.Scene;

    // Platformer feel state
    private coyoteTimer = 0;
    private jumpBufferTimer = 0;
    private isJumping = false;
    private wasOnFloor = false;

    /**
     * Set while a squash or stretch tween owns the sprite scale, so the
     * per-frame airborne stretch does not fight it.
     */
    private deformTween: Phaser.Tweens.Tween | null = null;

    constructor(scene: Phaser.Scene, x: number, y: number, tuningData: PlayerTuningData) {
        this.scene = scene;
        this.tuning = new PlayerTuning(tuningData);
        this.abilityManager = new AbilityManager();

        // Create sprite using the 'crow' static image
        this.sprite = scene.physics.add.sprite(x, y, 'crow');
        this.sprite.setOrigin(0.5, 1); // Bottom-center

        // No scaling - use native size like owl and cockroach do
        // No Y offset - use same setup as owl and cockroach

        this.sprite.setCollideWorldBounds(false); // Don't collide — we handle pit death in GameScene

        // Configure physics body - adjust based on actual sprite dimensions
        const body = this.sprite.body as Phaser.Physics.Arcade.Body;
        // IMPORTANT: Use displayWidth/displayHeight (scaled) not width/height (native frame size)
        const frameWidth = this.sprite.displayWidth;
        const frameHeight = this.sprite.displayHeight;

        // Collision body: slightly smaller than sprite for better gameplay feel
        // Width: ~62.5% of sprite width, Height: ~87.5% of sprite height
        const bodyWidth = Math.floor(frameWidth * 0.625);
        const bodyHeight = Math.floor(frameHeight * 0.875);
        const offsetX = Math.floor((frameWidth - bodyWidth) / 2);
        // Align body to bottom of sprite (origin is at 0.5, 1 = bottom-center)
        const offsetY = Math.floor(frameHeight - bodyHeight);

        body.setSize(bodyWidth, bodyHeight);
        body.setOffset(offsetX, offsetY);
        body.setGravityY(DEFAULT_GRAVITY * (this.tuning.gravityScale - 1)); // Additional gravity beyond world default
        body.setMaxVelocityY(this.tuning.terminalVelocity);

        applyGroundingVisualSink(this.sprite, 4);

        // Add to player group for collision detection
        this.sprite.setData('entity', this);
    }

    /**
     * Anticipation on the launch frame.
     *
     * The impulse is still applied the instant the button is read - delaying it
     * to play a real anticipation frame would add input latency, which is the
     * wrong trade for a seven-year-old. This is the visual read of anticipation
     * without the cost: a fast crouch that springs into the rise stretch.
     */
    private playJumpDeform(): void {
        this.deform(0.86, 1.14, 70, () => this.deform(1.02, 0.98, 90));
    }

    /**
     * Landing squash, then a small overshoot, then settle.
     *
     * Volume is preserved (scaleX * scaleY stays near 1) and the sprite origin
     * is bottom-centre, so the feet stay planted while the body compresses.
     * brand/BRAND_SYSTEM.md section 9.2 owns these numbers.
     */
    private playLandDeform(): void {
        this.deform(1.18, 0.82, 80, () =>
            this.deform(0.96, 1.06, 120, () => this.deform(1, 1, 90)));
    }

    /** Run one scale tween, replacing whatever deform was running. */
    private deform(scaleX: number, scaleY: number, duration: number, onComplete?: () => void): void {
        this.deformTween?.remove();
        this.deformTween = this.scene.tweens.add({
            targets: this.sprite,
            scaleX,
            scaleY,
            duration,
            ease: 'Sine.easeOut',
            onComplete: () => {
                this.deformTween = null;
                onComplete?.();
            },
        });
    }

    /**
     * Stretch on the way up, recover on the way down.
     *
     * Purely visual: no physics value is touched. The vertical motion model is
     * under a golden-fixture parity contract with the Godot port
     * (godot/tests/test_motion_parity.gd), so anything that changes gravity or
     * velocity has to land in both runtimes at once.
     */
    private updateAirborneStretch(onFloor: boolean, velocityY: number): void {
        if (this.deformTween || onFloor) {
            return;
        }

        // Fully stretched at the top of the rise, neutral by the time he falls.
        const rise = Phaser.Math.Clamp(-velocityY / this.tuning.jumpVelocity, 0, 1);
        this.sprite.setScale(1 - rise * 0.08, 1 + rise * 0.12);
    }

    update(input: InputState, delta: number): void {
        const body = this.sprite.body as Phaser.Physics.Arcade.Body;
        const onFloor = body.blocked.down;
        const deltaMs = delta;

        // Update timed tuning modifiers
        this.tuning.updateTimedModifiers(deltaMs);

        // --- Coyote time ---
        if (onFloor) {
            this.coyoteTimer = this.tuning.coyoteMs;
        } else if (this.wasOnFloor && !onFloor) {
            // Just left the ground
        }
        this.coyoteTimer -= deltaMs;

        // --- Jump buffer ---
        if (input.jumpJustPressed) {
            this.jumpBufferTimer = this.tuning.jumpBufferMs;
        }
        this.jumpBufferTimer -= deltaMs;

        // --- Horizontal movement ---
        if (input.left) {
            body.setAccelerationX(-this.tuning.accel);
            this.sprite.setFlipX(true);
        } else if (input.right) {
            body.setAccelerationX(this.tuning.accel);
            this.sprite.setFlipX(false);
        } else {
            body.setAccelerationX(0);
            // Apply drag manually for snappy stop
            if (onFloor) {
                body.setDragX(this.tuning.drag);
            } else {
                body.setDragX(this.tuning.drag * 0.4); // Less drag in air
            }
        }

        // Clamp horizontal speed
        if (Math.abs(body.velocity.x) > this.tuning.maxSpeed) {
            body.setVelocityX(Math.sign(body.velocity.x) * this.tuning.maxSpeed);
        }

        // --- Jump ---
        if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
            body.setVelocityY(-this.tuning.jumpVelocity);
            this.jumpBufferTimer = 0;
            this.coyoteTimer = 0;
            this.isJumping = true;
            AudioManager.getInstance().playSFX('player_jump');
            DopamineFX.jumpDust(this.scene, this.sprite.x, this.sprite.y + 16);
            this.playJumpDeform();
        }

        // Variable jump height - release early for shorter jump
        if (this.isJumping && !input.jumpHeld && body.velocity.y < -100) {
            body.setVelocityY(body.velocity.y * 0.5);
            this.isJumping = false;
        }

        if (onFloor) {
            this.isJumping = false;
        }

        // --- Abilities ---
        this.abilityManager.update(body, input, delta, {
            isOnFloor: onFloor,
            velocity: body.velocity,
            jumpVelocity: this.tuning.jumpVelocity,
        });

        // --- Animation ---
        if (!onFloor) {
            // Airborne — show static pose (no jump animation available yet)
            this.sprite.anims.stop();
            this.sprite.setTexture('crow');
        } else if (Math.abs(body.velocity.x) > 10) {
            // On ground and moving — walk
            if (!this.sprite.anims.isPlaying || this.sprite.anims.currentAnim?.key !== 'crow_walk') {
                this.sprite.anims.play('crow_walk', true);
            }
        } else {
            // On ground and still — idle
            this.sprite.anims.stop();
            this.sprite.setTexture('crow');
        }

        // --- Landing ---
        if (onFloor && !this.wasOnFloor) {
            AudioManager.getInstance().playSFX('land');
            DopamineFX.jumpDust(this.scene, this.sprite.x, this.sprite.y);
            this.playLandDeform();
        }

        this.updateAirborneStretch(onFloor, body.velocity.y);

        this.wasOnFloor = onFloor;
    }

    setPosition(x: number, y: number): void {
        this.sprite.setPosition(x, y);
    }

    destroy(): void {
        this.abilityManager.clear();
        this.sprite.destroy();
    }
}
