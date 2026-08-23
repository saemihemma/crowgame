import { FocusHighlight } from './components/FocusHighlight';

export interface NavButton {
    x: number;
    y: number;
    width: number;
    height: number;
    onActivate: () => void;
    onFocus?: () => void;
    onBlur?: () => void;
}

/**
 * Reusable keyboard navigation for UI screens.
 * Supports WASD + arrow keys to navigate, Enter to activate.
 * Each scene creates its own instance and registers buttons.
 */
export class UINavigator {
    private scene: Phaser.Scene;
    private direction: 'vertical' | 'horizontal';
    private items: NavButton[] = [];
    private focusIndex = 0;
    private enabled = false;
    private highlight: FocusHighlight;

    // Key objects
    private keyUp?: Phaser.Input.Keyboard.Key;
    private keyDown?: Phaser.Input.Keyboard.Key;
    private keyLeft?: Phaser.Input.Keyboard.Key;
    private keyRight?: Phaser.Input.Keyboard.Key;
    private keyW?: Phaser.Input.Keyboard.Key;
    private keyA?: Phaser.Input.Keyboard.Key;
    private keyS?: Phaser.Input.Keyboard.Key;
    private keyD?: Phaser.Input.Keyboard.Key;
    private keyEnter?: Phaser.Input.Keyboard.Key;
    private keySpace?: Phaser.Input.Keyboard.Key;

    private updateHandler: () => void;

    constructor(scene: Phaser.Scene, direction: 'vertical' | 'horizontal' = 'vertical') {
        this.scene = scene;
        this.direction = direction;
        this.highlight = new FocusHighlight(scene);

        // Create key objects
        const kb = scene.input.keyboard;
        if (kb) {
            this.keyUp = kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP, false);
            this.keyDown = kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN, false);
            this.keyLeft = kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT, false);
            this.keyRight = kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT, false);
            this.keyW = kb.addKey(Phaser.Input.Keyboard.KeyCodes.W, false);
            this.keyA = kb.addKey(Phaser.Input.Keyboard.KeyCodes.A, false);
            this.keyS = kb.addKey(Phaser.Input.Keyboard.KeyCodes.S, false);
            this.keyD = kb.addKey(Phaser.Input.Keyboard.KeyCodes.D, false);
            this.keyEnter = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER, false);
            this.keySpace = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE, false);
        }

        // Bind update to scene update loop
        this.updateHandler = this.update.bind(this);
        scene.events.on('update', this.updateHandler);

        // Cleanup when scene shuts down
        scene.events.once('shutdown', () => this.destroy());
    }

    addButton(opts: NavButton): void {
        this.items.push(opts);
    }

    clearButtons(): void {
        // Blur current
        if (this.enabled && this.items[this.focusIndex]?.onBlur) {
            this.items[this.focusIndex].onBlur!();
        }
        this.items = [];
        this.focusIndex = 0;
        this.highlight.hide();
    }

    enable(startIndex = 0): void {
        if (this.items.length === 0) return;
        this.enabled = true;
        this.focusIndex = Math.min(startIndex, this.items.length - 1);
        this.applyFocus();
    }

    disable(): void {
        if (this.enabled && this.items[this.focusIndex]?.onBlur) {
            this.items[this.focusIndex].onBlur!();
        }
        this.enabled = false;
        this.highlight.hide();
    }

    /** Call from outside to move focus to a specific index (e.g., on mouse hover) */
    setFocus(index: number): void {
        if (!this.enabled || index < 0 || index >= this.items.length) return;
        if (index === this.focusIndex) return;

        // Blur previous
        this.items[this.focusIndex]?.onBlur?.();

        this.focusIndex = index;
        this.applyFocus();
    }

    /** Get the current number of registered items */
    getItemCount(): number {
        return this.items.length;
    }

    /** Index of the focused item, or -1 when navigation is disabled. */
    getFocusIndex(): number {
        return this.enabled ? this.focusIndex : -1;
    }

    /**
     * Move a registered item's on-screen position.
     *
     * Items that live inside a ScrollList move as the list scrolls, and the
     * focus ring is drawn in screen space, so the list pushes new coordinates
     * in here on every scroll. Deliberately does not re-fire `onFocus`: that
     * repaints the item, and this can run every frame during a flick.
     */
    setItemPosition(index: number, x: number, y: number): void {
        const item = this.items[index];
        if (!item) return;
        item.x = x;
        item.y = y;
        if (this.enabled && index === this.focusIndex) {
            this.highlight.show(item.x, item.y, item.width, item.height);
        }
    }

    destroy(): void {
        this.disable();
        this.scene.events.off('update', this.updateHandler);
        this.highlight.destroy();

        // Remove keys
        const kb = this.scene.input.keyboard;
        if (kb) {
            if (this.keyUp) kb.removeKey(this.keyUp);
            if (this.keyDown) kb.removeKey(this.keyDown);
            if (this.keyLeft) kb.removeKey(this.keyLeft);
            if (this.keyRight) kb.removeKey(this.keyRight);
            if (this.keyW) kb.removeKey(this.keyW);
            if (this.keyA) kb.removeKey(this.keyA);
            if (this.keyS) kb.removeKey(this.keyS);
            if (this.keyD) kb.removeKey(this.keyD);
            if (this.keyEnter) kb.removeKey(this.keyEnter);
            if (this.keySpace) kb.removeKey(this.keySpace);
        }
    }

    private update(): void {
        if (!this.enabled || this.items.length === 0) return;

        const JD = Phaser.Input.Keyboard.JustDown;

        // Navigation
        let delta = 0;
        if (this.direction === 'vertical') {
            if ((this.keyUp && JD(this.keyUp)) || (this.keyW && JD(this.keyW))) delta = -1;
            else if ((this.keyDown && JD(this.keyDown)) || (this.keyS && JD(this.keyS))) delta = 1;
        } else {
            if ((this.keyLeft && JD(this.keyLeft)) || (this.keyA && JD(this.keyA))) delta = -1;
            else if ((this.keyRight && JD(this.keyRight)) || (this.keyD && JD(this.keyD))) delta = 1;
        }

        if (delta !== 0) {
            // Blur current
            this.items[this.focusIndex]?.onBlur?.();

            // Move with wrap
            this.focusIndex = (this.focusIndex + delta + this.items.length) % this.items.length;
            this.applyFocus();
        }

        // Activation
        if ((this.keyEnter && JD(this.keyEnter)) || (this.keySpace && JD(this.keySpace))) {
            this.items[this.focusIndex]?.onActivate();
        }
    }

    private applyFocus(): void {
        const item = this.items[this.focusIndex];
        if (!item) return;

        this.highlight.show(item.x, item.y, item.width, item.height);
        item.onFocus?.();
    }
}
