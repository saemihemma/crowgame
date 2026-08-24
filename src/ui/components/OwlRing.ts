import { ThemeManager, THEME_CHANGED } from '../theme/ThemeManager';
import { EventBus, GameEvents } from '../../utils/EventBus';
import { TextManager } from '../../systems/TextManager';
import { DopamineFX } from '../fx/DopamineFX';

/**
 * The owl ring — the HUD's goal anchor.
 *
 * Replaces the old `OwlCounter`, which rendered the entire point of the game as
 * `x0` in the same weight as a coin count. A segmented ring answers "how close
 * am I" without reading a number, which matters enormously for a player who is
 * still learning to read.
 *
 * See brand/BRAND_SYSTEM.md §8.2 for the pod layout and §10.2 for the streak.
 */
export class OwlRing {
    private static readonly RADIUS = 25;
    private static readonly STROKE = 6;
    /**
     * The ring carries its own contrast rather than borrowing it from the world.
     *
     * The concept for this component was mocked over a screenshot, which let the
     * scene supply the darkness the ring needed. Over Emberwood's dawn sky the
     * first implementation was the *least* visible thing on the HUD — the exact
     * opposite of what a goal anchor is for. The bezel and the disc below exist
     * so the ring reads identically on a peach sky and in a black cave.
     */
    private static readonly BEZEL = 11;
    private static readonly TRACK_ALPHA = 0.42;
    /** Bezel sits a hair outside the segment channel so segments read as slots. */
    private static readonly BEZEL_RADIUS_OFFSET = 1.5;
    private static readonly SEGMENT_GAP_RAD = 0.16;
    private static readonly SWEEP_MS = 400;

    private readonly scene: Phaser.Scene;
    private readonly container: Phaser.GameObjects.Container;
    private readonly track: Phaser.GameObjects.Graphics;
    private readonly fill: Phaser.GameObjects.Graphics;
    private readonly flame: Phaser.GameObjects.Graphics;
    private readonly icon: Phaser.GameObjects.Image | null = null;
    private readonly progressText: Phaser.GameObjects.Text;
    private readonly totalText: Phaser.GameObjects.Text;

    private segments = 3;
    private filled = 0;
    /** Animated 0..1 across the whole ring, so a sweep can be tweened. */
    private sweep = 0;
    private streak = 0;
    private sessionTotal = 0;

    constructor(scene: Phaser.Scene, x: number, y: number) {
        this.scene = scene;
        this.container = scene.add.container(x, y).setScrollFactor(0).setDepth(200);

        this.flame = scene.add.graphics();
        this.track = scene.add.graphics();
        this.fill = scene.add.graphics();
        this.container.add([this.flame, this.track, this.fill]);

        if (scene.textures.exists('owl')) {
            this.icon = scene.add.image(0, 0, 'owl').setDisplaySize(30, 30);
            this.container.add(this.icon);
        }

        const tm = ThemeManager.getInstance();
        this.progressText = scene.add.text(0, OwlRing.RADIUS + 12, '', {
            fontSize: '15px',
            fontFamily: tm.getTheme().hud.font || 'monospace',
            color: tm.getColor('owl'),
            stroke: tm.getColor('ink'),
            strokeThickness: 5,
        }).setOrigin(0.5, 0);

        this.totalText = scene.add.text(0, OwlRing.RADIUS + 36, '', {
            fontSize: '11px',
            fontFamily: tm.getTheme().hud.font || 'monospace',
            color: tm.getColor('paper'),
            stroke: tm.getColor('ink'),
            strokeThickness: 4,
        }).setOrigin(0.5, 0).setAlpha(0.75);

        this.container.add([this.progressText, this.totalText]);

        this.redraw();
        this.refreshText();

        EventBus.on(GameEvents.LEVEL_OWLS, this.onLevelOwls, this);
        EventBus.on(GameEvents.OWL_SAVED, this.onOwlSaved, this);
        EventBus.on(GameEvents.STREAK_CHANGED, this.onStreakChanged, this);
        EventBus.on(THEME_CHANGED, this.onThemeChanged, this);
        scene.events.once('shutdown', () => this.destroy());
    }

    /** Session total, restored from the save on HUD creation. */
    setSessionTotal(total: number): void {
        this.sessionTotal = total;
        this.refreshText();
    }

    private onLevelOwls = (count: number): void => {
        this.segments = Math.max(1, count);
        this.filled = 0;
        this.sweep = 0;
        this.redraw();
        this.refreshText();
    };

    private onOwlSaved = (): void => {
        this.filled = Math.min(this.segments, this.filled + 1);
        this.sessionTotal++;
        this.refreshText();

        // Sweep the new segment in, then pop the whole ring.
        this.scene.tweens.add({
            targets: this,
            sweep: this.filled / this.segments,
            duration: OwlRing.SWEEP_MS,
            ease: 'Cubic.easeOut',
            onUpdate: () => this.redraw(),
            onComplete: () => DopamineFX.iconPop(this.scene, this.container),
        });
    };

    private onStreakChanged = (streak: number): void => {
        this.streak = streak;
        this.redraw();
    };

    private onThemeChanged = (): void => {
        const tm = ThemeManager.getInstance();
        this.progressText.setColor(tm.getColor('owl')).setStroke(tm.getColor('ink'), 3);
        this.totalText.setColor(tm.getColor('paper')).setStroke(tm.getColor('ink'), 2);
        this.redraw();
    };

    private refreshText(): void {
        const tt = TextManager.getInstance();
        this.progressText.setText(`${this.filled}/${this.segments}`);
        this.totalText.setText(tt.t('hud.owls_saved_total', this.sessionTotal));
    }

    /**
     * Redraw track, fill and flame.
     *
     * Arcs start at 12 o'clock and run clockwise, with a gap between segments so
     * the ring reads as "three owls" rather than as a percentage.
     */
    private redraw(): void {
        const tm = ThemeManager.getInstance();
        const r = OwlRing.RADIUS;
        const step = (Math.PI * 2) / this.segments;
        const gap = OwlRing.SEGMENT_GAP_RAD;
        const top = -Math.PI / 2;

        this.track.clear();

        // Solid disc behind the icon, so the owl sits on its own ground instead
        // of on whatever tile happens to be behind it.
        this.track.fillStyle(tm.getColorNum('ink'), 0.82);
        this.track.fillCircle(0, 0, r - OwlRing.STROKE / 2 + 1);

        // Dark bezel. Wide and near-opaque: this is the contrast floor.
        this.track.lineStyle(OwlRing.BEZEL, tm.getColorNum('ink'), 0.9);
        this.track.beginPath();
        this.track.arc(0, 0, r + OwlRing.BEZEL_RADIUS_OFFSET, 0, Math.PI * 2);
        this.track.strokePath();

        // Paper rim on the outer edge. The ink bezel separates the ring from a
        // bright sky; on a near-black one it is the same colour as the world, so
        // the rim is what keeps the ring a discrete object in both.
        this.track.lineStyle(1, tm.getColorNum('paper'), 0.22);
        this.track.beginPath();
        this.track.arc(0, 0, r + OwlRing.BEZEL / 2 + 1, 0, Math.PI * 2);
        this.track.strokePath();

        this.track.lineStyle(OwlRing.STROKE, tm.getColorNum('owl'), OwlRing.TRACK_ALPHA);
        for (let i = 0; i < this.segments; i++) {
            this.track.beginPath();
            this.track.arc(0, 0, r, top + i * step + gap / 2, top + (i + 1) * step - gap / 2);
            this.track.strokePath();
        }

        // Filled portion, clipped to the animated sweep so a rescue draws in.
        this.fill.clear();
        const litColor = this.streak >= 3 ? tm.getColorNum('coin') : tm.getColorNum('owl');
        this.fill.lineStyle(OwlRing.STROKE, litColor, 1);
        const sweepEnd = top + this.sweep * Math.PI * 2;
        for (let i = 0; i < this.segments; i++) {
            const from = top + i * step + gap / 2;
            const to = Math.min(top + (i + 1) * step - gap / 2, sweepEnd);
            if (to <= from) {
                break;
            }
            this.fill.beginPath();
            this.fill.arc(0, 0, r, from, to);
            this.fill.strokePath();
        }

        // Streak flame: a dashed halo outside the ring, brighter at 5+.
        this.flame.clear();
        if (this.streak >= 3) {
            const hot = this.streak >= 5;
            this.flame.lineStyle(hot ? 2 : 1.5, tm.getColorNum(hot ? 'notyet' : 'coin'), hot ? 0.7 : 0.45);
            const dashes = hot ? 16 : 12;
            for (let i = 0; i < dashes; i++) {
                const a = top + (i / dashes) * Math.PI * 2;
                this.flame.beginPath();
                this.flame.arc(0, 0, r + 6, a, a + (Math.PI * 2) / dashes * 0.5);
                this.flame.strokePath();
            }
        }
    }

    destroy(): void {
        EventBus.off(GameEvents.LEVEL_OWLS, this.onLevelOwls, this);
        EventBus.off(GameEvents.OWL_SAVED, this.onOwlSaved, this);
        EventBus.off(GameEvents.STREAK_CHANGED, this.onStreakChanged, this);
        EventBus.off(THEME_CHANGED, this.onThemeChanged, this);
        this.container.destroy(true);
    }
}
