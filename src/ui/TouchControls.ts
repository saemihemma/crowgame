import { ThemeManager, THEME_CHANGED } from './theme/ThemeManager';
import { EventBus } from '../utils/EventBus';
import { GAME_WIDTH, GAME_HEIGHT } from '../utils/Constants';
import { TextManager } from '../systems/TextManager';

/**
 * Virtual gamepad for mobile: D-pad (left/right) + Jump + Peck buttons.
 * Renders in the HUDScene, auto-hides on desktop.
 * Connects to InputManager via a callback.
 */
export class TouchControls {
    private scene: Phaser.Scene;
    private container: Phaser.GameObjects.Container;
    private buttons: Map<string, Phaser.GameObjects.Container> = new Map();

    // Current touch state - read by InputManager
    private _left = false;
    private _right = false;
    private _jumpPressed = false;
    private _jumpHeld = false;
    private _interact = false;
    private _shoot = false;

    // Callback to push state to InputManager
    private onStateChange: (state: {
        left: boolean;
        right: boolean;
        jumpJustPressed: boolean;
        jumpHeld: boolean;
        interact: boolean;
        shoot: boolean;
    }) => void;

    constructor(
        scene: Phaser.Scene,
        onStateChange: (state: {
            left: boolean;
            right: boolean;
            jumpJustPressed: boolean;
            jumpHeld: boolean;
            interact: boolean;
            shoot: boolean;
        }) => void,
    ) {
        this.scene = scene;
        this.onStateChange = onStateChange;
        this.container = scene.add.container(0, 0).setScrollFactor(0).setDepth(250);

        // Auto-hide on desktop
        const isTouchDevice = scene.sys.game.device.input.touch;
        if (!isTouchDevice) {
            this.container.setVisible(false);
            return;
        }

        this.buildButtons();

        EventBus.on(THEME_CHANGED, this.onThemeChanged, this);
    }

    private buildButtons(): void {
        // Clear existing
        this.buttons.forEach(b => b.destroy(true));
        this.buttons.clear();
        this.container.removeAll(true);

        const tm = ThemeManager.getInstance();
        const tt = TextManager.getInstance();
        const padding = 16;
        const btnSize = 88;
        const btnGap = 12;

        // --- D-PAD (bottom-left) ---
        const dpadY = GAME_HEIGHT - padding - btnSize;

        // Left arrow
        const leftBtn = this.createButton(
            padding,
            dpadY,
            btnSize,
            btnSize,
            '<',
            tm.getColorNum('secondary'),
            TouchControls.SYMBOL_FONT_SIZE,
        );
        this.setupButtonInput(leftBtn, 'left');
        this.buttons.set('left', leftBtn);

        // Right arrow
        const rightBtn = this.createButton(
            padding + btnSize + btnGap,
            dpadY,
            btnSize,
            btnSize,
            '>',
            tm.getColorNum('secondary'),
            TouchControls.SYMBOL_FONT_SIZE,
        );
        this.setupButtonInput(rightBtn, 'right');
        this.buttons.set('right', rightBtn);

        // --- JUMP (bottom-right) ---
        const jumpBtn = this.createButton(
            GAME_WIDTH - padding - btnSize,
            dpadY,
            btnSize,
            btnSize,
            tt.t('touch.jump'),
            tm.getColorNum('primary'),
        );
        this.setupButtonInput(jumpBtn, 'jump');
        this.buttons.set('jump', jumpBtn);

        // --- LASER (left of jump) ---
        const laserBtn = this.createButton(
            GAME_WIDTH - padding - btnSize * 2 - btnGap,
            dpadY,
            btnSize,
            btnSize,
            tt.t('touch.zap'),
            tm.getColorNum('danger'),
        );
        this.setupButtonInput(laserBtn, 'shoot');
        this.buttons.set('shoot', laserBtn);

        // --- PECK / INTERACT (above jump) ---
        const peckBtn = this.createButton(
            GAME_WIDTH - padding - btnSize,
            dpadY - btnSize - btnGap,
            btnSize,
            btnSize,
            tt.t('touch.peck'),
            tm.getColorNum('accent'),
        );
        this.setupButtonInput(peckBtn, 'peck');
        this.buttons.set('peck', peckBtn);
    }

    /** Type size for single-character symbol buttons (the d-pad arrows). */
    private static readonly SYMBOL_FONT_SIZE = 32;
    /** Type size for word buttons (JUMP / ZAP / PECK and their translations). */
    private static readonly WORD_FONT_SIZE = 18;

    /**
     * Shrink a label's type size until it fits the button.
     *
     * The size used to be picked from character count
     * (`label.length > 2 ? '18px' : '32px'`), which only worked by luck: every
     * symbol is one character and every word in both languages is three or
     * more. A two-character label in any language would have jumped to 32px and
     * overflowed. Size now comes from the button's role, with this as the net.
     */
    private static fitFontSize(label: string, preferred: number, maxWidth: number): number {
        if (label.length === 0) return preferred;
        // Monospace advance is ~0.6em; assume slightly wider so a broad
        // fallback font still fits.
        const ADVANCE_RATIO = 0.63;
        const fits = Math.floor(maxWidth / (label.length * ADVANCE_RATIO));
        return Math.max(10, Math.min(preferred, fits));
    }

    private createButton(
        x: number,
        y: number,
        w: number,
        h: number,
        label: string,
        bgColor: number,
        fontSize: number = TouchControls.WORD_FONT_SIZE,
    ): Phaser.GameObjects.Container {
        const btnContainer = this.scene.add.container(x, y);

        // Background
        const bg = this.scene.add.graphics();
        bg.fillStyle(bgColor, 0.65);
        bg.fillRoundedRect(0, 0, w, h, 6);
        bg.lineStyle(2, 0xffffff, 0.4);
        bg.strokeRoundedRect(0, 0, w, h, 6);
        btnContainer.add(bg);

        // Label
        const text = this.scene.add.text(w / 2, h / 2, label, {
            fontSize: `${TouchControls.fitFontSize(label, fontSize, w - 12)}px`,
            fontFamily: 'monospace',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 2,
        }).setOrigin(0.5, 0.5);
        btnContainer.add(text);

        // Interactive zone
        const zone = this.scene.add.zone(0, 0, w, h).setOrigin(0, 0).setInteractive();
        btnContainer.add(zone);

        // Store references for theming
        btnContainer.setData('bg', bg);
        btnContainer.setData('zone', zone);
        btnContainer.setData('width', w);
        btnContainer.setData('height', h);

        this.container.add(btnContainer);
        return btnContainer;
    }

    private setupButtonInput(btn: Phaser.GameObjects.Container, action: string): void {
        const zone = btn.getData('zone') as Phaser.GameObjects.Zone;

        zone.on('pointerdown', () => {
            this.onButtonDown(action);
            // Visual press feedback
            btn.setScale(0.9);
            btn.setAlpha(0.9);
        });

        zone.on('pointerup', () => {
            this.onButtonUp(action);
            btn.setScale(1);
            btn.setAlpha(1);
        });

        zone.on('pointerout', () => {
            this.onButtonUp(action);
            btn.setScale(1);
            btn.setAlpha(1);
        });
    }

    private onButtonDown(action: string): void {
        switch (action) {
            case 'left':
                this._left = true;
                break;
            case 'right':
                this._right = true;
                break;
            case 'jump':
                this._jumpPressed = true;
                this._jumpHeld = true;
                break;
            case 'peck':
                this._interact = true;
                break;
            case 'shoot':
                this._shoot = true;
                break;
        }
        this.pushState();
    }

    private onButtonUp(action: string): void {
        switch (action) {
            case 'left':
                this._left = false;
                break;
            case 'right':
                this._right = false;
                break;
            case 'jump':
                this._jumpHeld = false;
                break;
            case 'peck':
            case 'shoot':
                // one-shot, cleared after read
                break;
        }
        this.pushState();
    }

    private pushState(): void {
        this.onStateChange({
            left: this._left,
            right: this._right,
            jumpJustPressed: this._jumpPressed,
            jumpHeld: this._jumpHeld,
            interact: this._interact,
            shoot: this._shoot,
        });

        // Clear one-shot flags after push
        this._jumpPressed = false;
        this._interact = false;
        this._shoot = false;
    }

    private onThemeChanged = (): void => {
        if (this.container.visible) {
            this.buildButtons();
        }
    };

    /** Force show/hide (e.g. during math overlay, hide controls) */
    setVisible(visible: boolean): void {
        this.container.setVisible(visible);
    }

    destroy(): void {
        EventBus.off(THEME_CHANGED, this.onThemeChanged, this);
        this.container.destroy(true);
    }
}
