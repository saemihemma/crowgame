import Phaser from 'phaser';
import { ThemeManager } from '../theme/ThemeManager';

export interface ScrollListOptions {
    /** Viewport left edge. */
    x: number;
    /** Viewport top edge. */
    y: number;
    width: number;
    height: number;
    /**
     * Where to draw the "more below" arrow. Defaults to the viewport centre;
     * pass a gutter x when centred content would sit underneath it.
     */
    arrowX?: number;
}

/**
 * ScrollList — a masked, flickable viewport for content taller than the canvas.
 *
 * The canvas is a fixed 960x540, so any list that grows with content eventually
 * runs off the bottom: level select laid its sixth node out at y=700 and simply
 * lost two levels, and the login profile list does the same at four children.
 *
 * Designed for five-to-seven-year-olds, which drives three choices:
 *
 *  - **The layout is the affordance.** The strongest "there is more" signal for
 *    a child who cannot yet read a scrollbar is a partially visible next item.
 *    Callers size their rows so the next one peeks above the fold; the fade,
 *    the drawn arrow and the thumb are all secondary to that.
 *  - **Dragging must never fire a tap.** A child drags with a whole hand and
 *    wanders tens of pixels. Callers activate on pointer *up* and skip it when
 *    `wasDrag()` is true, so a scroll attempt can never launch a level.
 *  - **Momentum, not inertia games.** A flick carries and settles quickly with
 *    a soft edge bounce. It should feel physical and forgiving, not slippery.
 *
 * Everything drawn here is geometry and theme colour: no glyphs, so the arrow
 * cannot become the missing-glyph box that the PIN dots and the dialog arrow
 * used to be.
 */
export class ScrollList {
    /** Add items to this container, positioned in content space (0 = content top). */
    readonly content: Phaser.GameObjects.Container;

    private static readonly DRAG_THRESHOLD = 8;
    private static readonly FRICTION = 0.9;
    private static readonly MIN_VELOCITY = 0.4;
    private static readonly RUBBER_BAND = 0.35;
    private static readonly EDGE_RETURN = 0.2;
    private static readonly WHEEL_STEP = 0.6;
    private static readonly FADE_HEIGHT = 56;
    private static readonly THUMB_W = 5;
    private static readonly THUMB_IDLE_MS = 1100;

    private readonly scene: Phaser.Scene;
    private readonly view: { x: number; y: number; width: number; height: number };
    private readonly arrowX: number;

    private contentHeight = 0;
    private scrollY = 0;
    private velocity = 0;

    private pointerDown = false;
    private dragged = false;
    private lastPointerY = 0;
    private dragDistance = 0;

    private readonly maskShape: Phaser.GameObjects.Graphics;
    private readonly chrome: Phaser.GameObjects.Graphics;
    private readonly hintArrow: Phaser.GameObjects.Graphics;
    private arrowTween?: Phaser.Tweens.Tween;

    private idleTimer = 0;
    private destroyed = false;
    private scrollListeners: ((scrollY: number) => void)[] = [];

    private readonly onUpdate: () => void;
    private readonly onPointerDown: (p: Phaser.Input.Pointer) => void;
    private readonly onPointerMove: (p: Phaser.Input.Pointer) => void;
    private readonly onPointerUp: () => void;
    private readonly onWheel: (p: Phaser.Input.Pointer, o: unknown, dx: number, dy: number) => void;

    constructor(scene: Phaser.Scene, opts: ScrollListOptions) {
        this.scene = scene;
        this.view = { x: opts.x, y: opts.y, width: opts.width, height: opts.height };
        this.arrowX = opts.arrowX ?? opts.x + opts.width / 2;

        this.content = scene.add.container(0, this.view.y);

        this.maskShape = scene.make.graphics({}, false);
        this.maskShape.fillStyle(0xffffff, 1);
        this.maskShape.fillRect(this.view.x, this.view.y, this.view.width, this.view.height);
        this.content.setMask(this.maskShape.createGeometryMask());

        // Chrome sits above the masked content: bottom fade + scroll thumb.
        this.chrome = scene.add.graphics().setDepth(400);
        this.hintArrow = scene.add.graphics().setDepth(401).setVisible(false);
        this.buildHintArrow();

        this.onUpdate = () => this.update();
        this.onPointerDown = p => this.handlePointerDown(p);
        this.onPointerMove = p => this.handlePointerMove(p);
        this.onPointerUp = () => this.handlePointerUp();
        this.onWheel = (p, _o, _dx, dy) => this.handleWheel(p, dy);

        scene.events.on('update', this.onUpdate);
        scene.input.on('pointerdown', this.onPointerDown);
        scene.input.on('pointermove', this.onPointerMove);
        scene.input.on('pointerup', this.onPointerUp);
        scene.input.on('pointerupoutside', this.onPointerUp);
        scene.input.on('wheel', this.onWheel);
        scene.events.once('shutdown', () => this.destroy());
    }

    /** Total height of the content added to `content`, in content space. */
    setContentHeight(height: number): void {
        this.contentHeight = height;
        this.scrollY = Phaser.Math.Clamp(this.scrollY, 0, this.maxScroll());
        this.apply();
    }

    getScrollY(): number {
        return this.scrollY;
    }

    /** Highest valid scroll offset; 0 when the content already fits. */
    maxScroll(): number {
        return Math.max(0, this.contentHeight - this.view.height);
    }

    /** Whether the content is taller than the viewport at all. */
    isScrollable(): boolean {
        return this.maxScroll() > 0;
    }

    scrollTo(y: number, animate = false): void {
        const target = Phaser.Math.Clamp(y, 0, this.maxScroll());
        this.velocity = 0;
        if (!animate) {
            this.scrollY = target;
            this.apply();
            return;
        }
        this.scene.tweens.add({
            targets: this,
            scrollY: target,
            duration: 420,
            ease: 'Cubic.easeOut',
            onUpdate: () => this.apply(),
        });
    }

    /**
     * Scroll the smallest distance that brings a content-space range fully into
     * view. Used to keep keyboard focus visible while arrowing through a list.
     */
    revealRange(top: number, height: number, animate = true): void {
        const margin = 12;
        const viewTop = this.scrollY;
        const viewBottom = this.scrollY + this.view.height;
        if (top - margin < viewTop) {
            this.scrollTo(top - margin, animate);
        } else if (top + height + margin > viewBottom) {
            this.scrollTo(top + height + margin - this.view.height, animate);
        }
    }

    /**
     * True when the last pointer sequence moved far enough to count as a drag.
     * Stays true until the next pointer-down, so callers can check it from a
     * pointer-up handler without depending on event ordering.
     */
    wasDrag(): boolean {
        return this.dragged;
    }

    onScroll(cb: (scrollY: number) => void): void {
        this.scrollListeners.push(cb);
    }

    /**
     * Tear the list down completely. Safe to call twice: callers destroy it on
     * a state change and the scene shutdown handler fires too.
     *
     * `content` must go with it. Leaving it behind is not merely a leak: its
     * children keep their interactive zones, and input hit-testing does not
     * care that the mask is gone. A stale login profile list left the
     * "+ New User" zone live at y=274 underneath the Create Character screen,
     * so tapping GO at y=280 silently re-entered the new-user state and wiped
     * the name the player had just typed.
     */
    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;

        this.scene.events.off('update', this.onUpdate);
        this.scene.input.off('pointerdown', this.onPointerDown);
        this.scene.input.off('pointermove', this.onPointerMove);
        this.scene.input.off('pointerup', this.onPointerUp);
        this.scene.input.off('pointerupoutside', this.onPointerUp);
        this.scene.input.off('wheel', this.onWheel);
        this.arrowTween?.stop();
        this.scrollListeners = [];
        this.content.destroy(true);
        this.maskShape.destroy();
        this.chrome.destroy();
        this.hintArrow.destroy();
    }

    // ─── Input ────────────────────────────────────────────────

    private inside(p: Phaser.Input.Pointer): boolean {
        return p.x >= this.view.x && p.x <= this.view.x + this.view.width
            && p.y >= this.view.y && p.y <= this.view.y + this.view.height;
    }

    private handlePointerDown(p: Phaser.Input.Pointer): void {
        this.dragged = false;
        if (!this.isScrollable() || !this.inside(p)) return;
        this.pointerDown = true;
        this.lastPointerY = p.y;
        this.dragDistance = 0;
        this.velocity = 0;
    }

    private handlePointerMove(p: Phaser.Input.Pointer): void {
        if (!this.pointerDown) return;
        const dy = p.y - this.lastPointerY;
        this.lastPointerY = p.y;
        if (dy === 0) return;

        // Only a cumulative move past the threshold counts as a drag. A child
        // holding a finger still still wanders a pixel or two, and treating
        // that as a drag would swallow their tap.
        this.dragDistance += Math.abs(dy);
        if (this.dragDistance > ScrollList.DRAG_THRESHOLD) this.dragged = true;

        // Rubber-band: resist movement once past either end.
        const next = this.scrollY - dy;
        const overshoot = next < 0 ? -next : next > this.maxScroll() ? next - this.maxScroll() : 0;
        this.scrollY = overshoot > 0 ? this.scrollY - dy * ScrollList.RUBBER_BAND : next;
        this.velocity = -dy;
        this.idleTimer = 0;
        this.apply();
    }

    private handlePointerUp(): void {
        this.pointerDown = false;
    }

    private handleWheel(p: Phaser.Input.Pointer, dy: number): void {
        if (!this.isScrollable() || !this.inside(p)) return;
        this.velocity = 0;
        this.scrollY = Phaser.Math.Clamp(
            this.scrollY + dy * ScrollList.WHEEL_STEP, 0, this.maxScroll(),
        );
        this.idleTimer = 0;
        this.apply();
    }

    // ─── Frame loop ───────────────────────────────────────────

    private update(): void {
        const max = this.maxScroll();

        if (!this.pointerDown && Math.abs(this.velocity) > ScrollList.MIN_VELOCITY) {
            // Normalise by frame time so a flick travels the same distance at
            // 30fps as at 120fps -- per-frame friction made the glide four
            // times longer on a slow device.
            const step = Phaser.Math.Clamp(this.scene.game.loop.delta / 16.667, 0.25, 4);
            this.scrollY += this.velocity * step;
            this.velocity *= Math.pow(ScrollList.FRICTION, step);

            // Stop dead at either end. Letting momentum sail past and then
            // crawl back left the list resting hundreds of pixels beyond the
            // last row for seconds; a hard stop also reads more clearly to a
            // child than a long bounce.
            if (this.scrollY <= 0) {
                this.scrollY = 0;
                this.velocity = 0;
            } else if (this.scrollY >= max) {
                this.scrollY = max;
                this.velocity = 0;
            }
            this.idleTimer = 0;
            this.apply();
        } else if (!this.pointerDown) {
            this.velocity = 0;
            // Ease back inside the bounds after an overscroll.
            if (this.scrollY < 0 || this.scrollY > max) {
                const target = this.scrollY < 0 ? 0 : max;
                const delta = (target - this.scrollY) * ScrollList.EDGE_RETURN;
                this.scrollY = Math.abs(delta) < 0.5 ? target : this.scrollY + delta;
                this.apply();
            }
        }

        if (this.idleTimer < ScrollList.THUMB_IDLE_MS) {
            this.idleTimer += this.scene.game.loop.delta;
            this.drawChrome();
        }
    }

    private apply(): void {
        this.content.y = this.view.y - this.scrollY;
        this.drawChrome();
        for (const cb of this.scrollListeners) cb(this.scrollY);
    }

    // ─── Chrome ───────────────────────────────────────────────

    private drawChrome(): void {
        const tm = ThemeManager.getInstance();
        const { x, y, width, height } = this.view;
        const max = this.maxScroll();

        this.chrome.clear();

        if (max <= 0) {
            this.hintArrow.setVisible(false);
            return;
        }

        const atBottom = this.scrollY >= max - 1;
        const atTop = this.scrollY <= 1;
        const ground = tm.getColorNum('primary');

        // Soft fade at whichever edge has content beyond it, so the list reads
        // as continuing rather than ending.
        if (!atBottom) {
            this.chrome.fillGradientStyle(ground, ground, ground, ground, 0, 0, 0.85, 0.85);
            this.chrome.fillRect(x, y + height - ScrollList.FADE_HEIGHT, width, ScrollList.FADE_HEIGHT);
        }
        if (!atTop) {
            this.chrome.fillGradientStyle(ground, ground, ground, ground, 0.85, 0.85, 0, 0);
            this.chrome.fillRect(x, y, width, ScrollList.FADE_HEIGHT * 0.6);
        }

        // Thumb, for the adult in the room. Fades out once scrolling stops.
        const idleAlpha = this.idleTimer >= ScrollList.THUMB_IDLE_MS
            ? 0
            : 1 - this.idleTimer / ScrollList.THUMB_IDLE_MS;
        if (idleAlpha > 0.01) {
            const trackH = height - 16;
            const thumbH = Math.max(36, trackH * (height / this.contentHeight));
            const thumbY = y + 8 + (trackH - thumbH) * (Phaser.Math.Clamp(this.scrollY, 0, max) / max);
            const thumbX = x + width - ScrollList.THUMB_W - 6;
            this.chrome.fillStyle(tm.getColorNum('textColor'), 0.1 + 0.3 * idleAlpha);
            this.chrome.fillRoundedRect(thumbX, y + 8, ScrollList.THUMB_W, trackH, ScrollList.THUMB_W / 2);
            this.chrome.fillStyle(tm.getColorNum('accent'), 0.35 + 0.5 * idleAlpha);
            this.chrome.fillRoundedRect(thumbX, thumbY, ScrollList.THUMB_W, thumbH, ScrollList.THUMB_W / 2);
        }

        // Drawn arrow, never a glyph. Visible only while there is more below.
        this.hintArrow.setVisible(!atBottom);
    }

    /**
     * Build the "more below" arrow once and bob it forever.
     *
     * Drawn as a triangle rather than set as the character U+25BC: that lives in
     * the Geometric Shapes block, which is exactly what turned the PIN dots and
     * the dialog advance cue into missing-glyph boxes.
     */
    private buildHintArrow(): void {
        const tm = ThemeManager.getInstance();
        const cx = this.arrowX;
        const cy = this.view.y + this.view.height - 20;
        const w = 22;
        const h = 11;

        this.hintArrow.clear();
        this.hintArrow.fillStyle(tm.getColorNum('accent'), 0.95);
        this.hintArrow.fillTriangle(cx - w / 2, cy - h / 2, cx + w / 2, cy - h / 2, cx, cy + h / 2);

        this.arrowTween = this.scene.tweens.add({
            targets: this.hintArrow,
            y: { from: -4, to: 2 },
            duration: 620,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
    }
}
