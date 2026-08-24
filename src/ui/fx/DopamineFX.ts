import { ThemeManager } from '../theme/ThemeManager';
import { TextManager } from '../../systems/TextManager';

/**
 * Reusable library of feel-good micro-animations.
 * All methods are static and operate on a given scene.
 * Returns tweens/emitters so callers can chain or await them.
 */
export class DopamineFX {

    // ─── Coin collect burst ───────────────────────────────────
    /** Gold particle explosion + "+1" text float at world position */
    static coinBurst(scene: Phaser.Scene, x: number, y: number): void {
        const tm = ThemeManager.getInstance();
        const accentColor = tm.getColor('accent');

        // Spawn several tiny particles flying outward
        for (let i = 0; i < 6; i++) {
            const particle = scene.add.circle(
                x, y, 4 + Math.random() * 4,
                tm.getColorNum('accent'), 1,
            ).setDepth(150);

            const angle = (Math.PI * 2 * i) / 6 + Math.random() * 0.5;
            const dist = 30 + Math.random() * 30;

            scene.tweens.add({
                targets: particle,
                x: x + Math.cos(angle) * dist,
                y: y + Math.sin(angle) * dist - 20,
                alpha: 0,
                scaleX: 0.2,
                scaleY: 0.2,
                duration: 350 + Math.random() * 150,
                ease: 'Power2',
                onComplete: () => particle.destroy(),
            });
        }

        // "+1" fly-up text
        DopamineFX.numberFlyUp(scene, x, y - 16, '+1', accentColor);
    }

    // ─── Correct answer flash ────────────────────────────────
    /** Green pulse overlay on any game object */
    static correctFlash(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject): Phaser.Tweens.Tween {
        const obj = target as unknown as Phaser.GameObjects.Components.Transform;

        // Flash green tint only if the target supports it (Containers don't)
        const tintable = target as unknown as Phaser.GameObjects.Components.Tint;
        if (typeof tintable.setTint === 'function') {
            tintable.setTint(0x44ff44);
        }

        return scene.tweens.add({
            targets: target,
            scaleX: (obj.scaleX ?? 1) * 1.15,
            scaleY: (obj.scaleY ?? 1) * 1.15,
            duration: 120,
            yoyo: true,
            ease: 'Sine.easeInOut',
            onComplete: () => {
                if (typeof tintable.clearTint === 'function') {
                    tintable.clearTint();
                }
            },
        });
    }

    // ─── Wrong answer shake ──────────────────────────────────
    /** Horizontal oscillation tween (3x small shakes) */
    static wrongShake(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject): Phaser.Tweens.Tween {
        const obj = target as unknown as Phaser.GameObjects.Components.Transform;
        const origX = obj.x;

        return scene.tweens.add({
            targets: target,
            x: origX + 4,
            duration: 40,
            yoyo: true,
            repeat: 5,
            ease: 'Sine.easeInOut',
            onComplete: () => {
                obj.x = origX;
            },
        });
    }

    // ─── Number fly-up ───────────────────────────────────────
    /** Text rises and fades (world-space or camera-space) */
    static numberFlyUp(
        scene: Phaser.Scene,
        x: number,
        y: number,
        text: string,
        color: string = '#ffffff',
        scrollFactor: number = 1,
    ): Phaser.GameObjects.Text {
        const flyText = scene.add.text(x, y, text, {
            fontSize: '24px',
            fontFamily: 'monospace',
            color,
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5, 1)
          .setScrollFactor(scrollFactor)
          .setDepth(210);

        scene.tweens.add({
            targets: flyText,
            y: y - 48,
            alpha: 0,
            duration: 600,
            ease: 'Power2',
            onComplete: () => flyText.destroy(),
        });

        return flyText;
    }

    // ─── Celebration burst ───────────────────────────────────
    /** Large confetti/star particles for milestones */
    static celebrationBurst(scene: Phaser.Scene, x: number, y: number): void {
        const colors = [0xffd700, 0xff6b6b, 0x44ff44, 0x44aaff, 0xff44ff];

        for (let i = 0; i < 16; i++) {
            const color = colors[i % colors.length];
            const size = 4 + Math.random() * 6;
            const particle = scene.add.rectangle(
                x, y, size, size, color, 1,
            ).setDepth(160);

            // Random rotation
            particle.setAngle(Math.random() * 360);

            const angle = (Math.PI * 2 * i) / 16 + Math.random() * 0.3;
            const dist = 60 + Math.random() * 80;

            scene.tweens.add({
                targets: particle,
                x: x + Math.cos(angle) * dist,
                y: y + Math.sin(angle) * dist + 40, // gravity feel
                alpha: 0,
                angle: particle.angle + 180 + Math.random() * 180,
                scaleX: 0.1,
                scaleY: 0.1,
                duration: 500 + Math.random() * 400,
                ease: 'Power2',
                onComplete: () => particle.destroy(),
            });
        }
    }

    // ─── Icon pop ────────────────────────────────────────────
    /** Scale bounce (1.0 -> 1.3 -> 1.0) with ease */
    static iconPop(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject): Phaser.Tweens.Tween {
        return scene.tweens.add({
            targets: target,
            scaleX: 1.3,
            scaleY: 1.3,
            duration: 120,
            yoyo: true,
            ease: 'Back.easeOut',
        });
    }

    // ─── Door unlock glow ────────────────────────────────────
    /** Glow aura around a door object + scale pulse */
    static doorUnlock(scene: Phaser.Scene, door: Phaser.GameObjects.GameObject): void {
        const obj = door as unknown as Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.Tint;

        // Create a glow rectangle behind the door
        const glow = scene.add.rectangle(
            obj.x, obj.y, 48, 80, 0xffd700, 0.5,
        ).setDepth((door as unknown as Phaser.GameObjects.Components.Depth).depth - 1);

        // Pulse the glow
        scene.tweens.add({
            targets: glow,
            alpha: 0,
            scaleX: 1.8,
            scaleY: 1.5,
            duration: 600,
            ease: 'Power2',
            onComplete: () => glow.destroy(),
        });

        // Pulse the door itself
        scene.tweens.add({
            targets: door,
            scaleX: 1.1,
            scaleY: 1.1,
            duration: 200,
            yoyo: true,
            ease: 'Sine.easeInOut',
        });
    }

    // ─── Ability grant ───────────────────────────────────────
    /** Icon flies from world position to HUD slot with trail */
    static abilityGrant(
        scene: Phaser.Scene,
        fromX: number,
        fromY: number,
        toX: number,
        toY: number,
        iconKey: string,
    ): void {
        // Create a temporary flying icon
        const flyIcon = scene.add.image(fromX, fromY, iconKey)
            .setDepth(300)
            .setScale(1.5)
            .setScrollFactor(0);

        // Trail particles
        const trailTimer = scene.time.addEvent({
            delay: 30,
            repeat: 15,
            callback: () => {
                const trail = scene.add.circle(
                    flyIcon.x, flyIcon.y, 4, 0xffd700, 0.6,
                ).setDepth(299).setScrollFactor(0);

                scene.tweens.add({
                    targets: trail,
                    alpha: 0,
                    scaleX: 0.1,
                    scaleY: 0.1,
                    duration: 200,
                    onComplete: () => trail.destroy(),
                });
            },
        });

        scene.tweens.add({
            targets: flyIcon,
            x: toX,
            y: toY,
            scaleX: 1,
            scaleY: 1,
            duration: 500,
            ease: 'Power3',
            onComplete: () => {
                trailTimer.destroy();
                flyIcon.destroy();

                // Landing burst
                DopamineFX.celebrationBurst(scene, toX, toY);
            },
        });
    }

    // ─── Screen flash ────────────────────────────────────────
    /** Brief fullscreen color flash (for big moments) */
    static screenFlash(scene: Phaser.Scene, color: number = 0xffffff, duration: number = 150): void {
        const flash = scene.add.rectangle(
            scene.cameras.main.width / 2,
            scene.cameras.main.height / 2,
            scene.cameras.main.width,
            scene.cameras.main.height,
            color,
            0.4,
        ).setScrollFactor(0).setDepth(500);

        scene.tweens.add({
            targets: flash,
            alpha: 0,
            duration,
            onComplete: () => flash.destroy(),
        });
    }

    // ─── Elastic entrance ────────────────────────────────────
    /** Scale from 0 -> 1 with elastic ease (for UI panels) */
    static elasticEntrance(
        scene: Phaser.Scene,
        target: Phaser.GameObjects.GameObject,
        duration: number = 400,
        delay: number = 0,
    ): Phaser.Tweens.Tween {
        const obj = target as unknown as Phaser.GameObjects.Components.Transform;
        obj.setScale(0);

        return scene.tweens.add({
            targets: target,
            scaleX: 1,
            scaleY: 1,
            duration,
            delay,
            ease: 'Back.easeOut',
        });
    }

    // ─── Elastic exit ────────────────────────────────────────
    /** Scale from 1 -> 0 for dismissing UI panels */
    static elasticExit(
        scene: Phaser.Scene,
        target: Phaser.GameObjects.GameObject,
        duration: number = 250,
        onComplete?: () => void,
    ): Phaser.Tweens.Tween {
        return scene.tweens.add({
            targets: target,
            scaleX: 0,
            scaleY: 0,
            duration,
            ease: 'Back.easeIn',
            onComplete,
        });
    }

    // ─── Level complete ──────────────────────────────────────
    /** Brief "Level Complete!" text flourish + celebration burst */
    static levelComplete(scene: Phaser.Scene, onDone?: () => void): void {
        const cx = scene.cameras.main.width / 2;
        const cy = scene.cameras.main.height / 2;

        // Celebration burst behind the text
        DopamineFX.celebrationBurst(scene, cx, cy);

        // Big centered text
        const text = scene.add.text(cx, cy, TextManager.getInstance().t('fx.level_complete'), {
            fontSize: '48px',
            fontFamily: 'monospace',
            color: '#ffd700',
            stroke: '#000000',
            strokeThickness: 8,
            align: 'center',
        }).setOrigin(0.5, 0.5)
          .setScrollFactor(0)
          .setDepth(500)
          .setScale(0);

        // Elastic scale in
        scene.tweens.add({
            targets: text,
            scaleX: 1,
            scaleY: 1,
            duration: 400,
            ease: 'Back.easeOut',
            onComplete: () => {
                // Hold briefly then fade out
                scene.time.delayedCall(600, () => {
                    scene.tweens.add({
                        targets: text,
                        y: cy - 60,
                        alpha: 0,
                        scaleX: 1.3,
                        scaleY: 1.3,
                        duration: 400,
                        ease: 'Power2',
                        onComplete: () => {
                            text.destroy();
                            onDone?.();
                        },
                    });
                });
            },
        });
    }

    // ─── Player death ────────────────────────────────────────
    /** Feather burst + tumble spin + fade for player death */
    static playerDeath(scene: Phaser.Scene, x: number, y: number): void {
        // Feather burst particles
        for (let i = 0; i < 12; i++) {
            const feather = scene.add.rectangle(
                x, y, 4 + Math.random() * 4, 8 + Math.random() * 6,
                0x8B6914, 1,
            ).setDepth(150);

            const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.5;
            const dist = 40 + Math.random() * 50;

            scene.tweens.add({
                targets: feather,
                x: x + Math.cos(angle) * dist,
                y: y + Math.sin(angle) * dist + 60,
                angle: Math.random() * 360,
                alpha: 0,
                duration: 600 + Math.random() * 200,
                ease: 'Power2',
                onComplete: () => feather.destroy(),
            });
        }
    }

    // ─── Enemy death ─────────────────────────────────────────
    /** Explosion particles + flash for enemy defeat */
    static enemyDeath(scene: Phaser.Scene, x: number, y: number): void {
        // Screen flash at enemy position
        const flash = scene.add.circle(x, y, 30, 0xffffff, 0.8).setDepth(140);
        scene.tweens.add({
            targets: flash,
            scaleX: 2,
            scaleY: 2,
            alpha: 0,
            duration: 200,
            onComplete: () => flash.destroy(),
        });

        // Explosion particles
        for (let i = 0; i < 10; i++) {
            const particle = scene.add.circle(
                x, y, 3 + Math.random() * 5,
                0xff4444, 1,
            ).setDepth(145);

            const angle = (Math.PI * 2 * i) / 10;
            const dist = 25 + Math.random() * 35;

            scene.tweens.add({
                targets: particle,
                x: x + Math.cos(angle) * dist,
                y: y + Math.sin(angle) * dist,
                alpha: 0,
                scaleX: 0.1,
                scaleY: 0.1,
                duration: 300 + Math.random() * 200,
                ease: 'Power2',
                onComplete: () => particle.destroy(),
            });
        }
    }

    // ─── Laser shoot ─────────────────────────────────────────
    /** Muzzle flash for laser shooting */
    static laserShoot(scene: Phaser.Scene, x: number, y: number, direction: number): void {
        // Muzzle flash
        const flash = scene.add.circle(
            x, y, 8,
            0xff6600, 0.8,
        ).setDepth(120);

        scene.tweens.add({
            targets: flash,
            scaleX: 2.5,
            scaleY: 2.5,
            alpha: 0,
            duration: 150,
            onComplete: () => flash.destroy(),
        });

        // Forward sparkles
        for (let i = 0; i < 3; i++) {
            const sparkle = scene.add.circle(
                x + direction * (10 + i * 5),
                y + (Math.random() - 0.5) * 6,
                2,
                0xffaa00, 1,
            ).setDepth(119);

            scene.tweens.add({
                targets: sparkle,
                x: sparkle.x + direction * 20,
                alpha: 0,
                duration: 200,
                delay: i * 30,
                onComplete: () => sparkle.destroy(),
            });
        }
    }

    // ─── XP gain ─────────────────────────────────────────────
    /** Sparkles flying from source to XP bar */
    static xpGain(scene: Phaser.Scene, fromX: number, fromY: number, toX: number, toY: number): void {
        for (let i = 0; i < 5; i++) {
            const sparkle = scene.add.circle(
                fromX, fromY, 3 + Math.random() * 2,
                0x44ff44, 1,
            ).setDepth(200).setScrollFactor(0);

            scene.tweens.add({
                targets: sparkle,
                x: toX + (Math.random() - 0.5) * 20,
                y: toY + (Math.random() - 0.5) * 20,
                alpha: 0,
                scaleX: 0.2,
                scaleY: 0.2,
                duration: 400 + Math.random() * 200,
                delay: i * 40,
                ease: 'Power2',
                onComplete: () => sparkle.destroy(),
            });
        }
    }

    // ─── Level up burst ──────────────────────────────────────
    /** Massive celebration with "LEVEL UP!" text + screen shake */
    static levelUpBurst(scene: Phaser.Scene): void {
        const cx = scene.cameras.main.width / 2;
        const cy = scene.cameras.main.height / 2;

        // Screen shake
        scene.cameras.main.shake(300, 0.008);

        // Massive celebration burst
        DopamineFX.celebrationBurst(scene, cx, cy);
        DopamineFX.celebrationBurst(scene, cx, cy); // Double burst

        // "LEVEL UP!" text
        const text = scene.add.text(cx, cy, TextManager.getInstance().t('fx.level_up'), {
            fontSize: '64px',
            fontFamily: 'monospace',
            color: '#ffd700',
            stroke: '#000000',
            strokeThickness: 10,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(510).setScale(0);

        scene.tweens.add({
            targets: text,
            scaleX: 1,
            scaleY: 1,
            duration: 300,
            ease: 'Back.easeOut',
            onComplete: () => {
                scene.time.delayedCall(800, () => {
                    scene.tweens.add({
                        targets: text,
                        alpha: 0,
                        y: cy - 80,
                        scaleX: 1.5,
                        scaleY: 1.5,
                        duration: 400,
                        onComplete: () => text.destroy(),
                    });
                });
            },
        });
    }

    // ─── Damage flash ────────────────────────────────────────
    /** Red vignette overlay pulse for taking damage */
    static damageFlash(scene: Phaser.Scene): void {
        const vignette = scene.add.rectangle(
            scene.cameras.main.width / 2,
            scene.cameras.main.height / 2,
            scene.cameras.main.width,
            scene.cameras.main.height,
            0xff0000,
            0.3,
        ).setScrollFactor(0).setDepth(495);

        scene.tweens.add({
            targets: vignette,
            alpha: 0,
            duration: 200,
            onComplete: () => vignette.destroy(),
        });
    }

    // ─── Damage edge pulse ───────────────────────────────────
    /**
     * Red pulse around the edges of the screen, for taking damage.
     *
     * Replaces the full-screen wash of `damageFlash` in gameplay: covering the
     * whole screen in red is a lot for a six-year-old, and it hides the thing
     * that just hit them at the exact moment they need to see it. The centre
     * stays clear. brand/BRAND_SYSTEM.md section 8.2.
     */
    static damageEdgePulse(scene: Phaser.Scene): void {
        const { width, height } = scene.cameras.main;
        const band = 56;
        const color = ThemeManager.getInstance().getColorNum('hurt');

        const edges = [
            scene.add.rectangle(width / 2, band / 2, width, band, color, 0.35),
            scene.add.rectangle(width / 2, height - band / 2, width, band, color, 0.35),
            scene.add.rectangle(band / 2, height / 2, band, height, color, 0.35),
            scene.add.rectangle(width - band / 2, height / 2, band, height, color, 0.35),
        ];

        for (const edge of edges) {
            edge.setScrollFactor(0).setDepth(495);
            scene.tweens.add({
                targets: edge,
                alpha: 0,
                duration: 260,
                ease: 'Sine.easeOut',
                onComplete: () => edge.destroy(),
            });
        }
    }

    // ─── Jump dust ───────────────────────────────────────────
    /** Small dust puff particles on jump and land */
    static jumpDust(scene: Phaser.Scene, x: number, y: number): void {
        for (let i = 0; i < 4; i++) {
            const dust = scene.add.circle(
                x + (Math.random() - 0.5) * 20,
                y,
                2 + Math.random() * 3,
                0xcccccc, 0.6,
            ).setDepth(10);

            scene.tweens.add({
                targets: dust,
                y: y + 15,
                x: dust.x + (Math.random() - 0.5) * 15,
                alpha: 0,
                scaleX: 0.1,
                scaleY: 0.1,
                duration: 300 + Math.random() * 200,
                onComplete: () => dust.destroy(),
            });
        }
    }

    // ─── Screen shake ────────────────────────────────────────
    /** Camera shake utility with configurable intensity */
    static screenShake(scene: Phaser.Scene, intensity: number = 0.01, duration: number = 200): void {
        scene.cameras.main.shake(duration, intensity);
    }

    // ─── Hitstop ─────────────────────────────────────────────
    /**
     * Freeze the world for a few frames so an impact reads as an impact.
     *
     * Two lines of effect for the largest per-effort gain in game feel available
     * anywhere in brand/BRAND_SYSTEM.md - see section 9.3 for the durations.
     *
     * Only physics is paused; tweens, the clock and rendering keep running, so
     * the particle burst that triggered the hitstop still plays through it. The
     * resume is guarded because a scene can shut down inside the window - a
     * level transition during an enemy pop would otherwise resume a dead world.
     */
    static hitstop(scene: Phaser.Scene, durationMs: number): void {
        const world = scene.physics?.world;
        if (!world || world.isPaused) {
            return;
        }

        world.pause();
        scene.time.delayedCall(durationMs, () => {
            if (scene.scene.isActive() && scene.physics?.world) {
                scene.physics.world.resume();
            }
        });
    }
}
