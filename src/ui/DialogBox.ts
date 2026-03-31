import { ThemeManager, THEME_CHANGED } from './theme/ThemeManager';
import { EventBus, GameEvents } from '../utils/EventBus';
import { GAME_WIDTH, GAME_HEIGHT } from '../utils/Constants';

export interface DialogLine {
    speaker: string;
    text: string;
    portraitKey?: string;
}

/**
 * Themed RPG-style dialog box for NPC conversations.
 * Appears at bottom of screen with optional portrait, speaker name,
 * and typewriter text effect. Advance with tap or interact button.
 */
export class DialogBox {
    private scene: Phaser.Scene;
    private container: Phaser.GameObjects.Container;
    private boxBg!: Phaser.GameObjects.Graphics;
    private nameText!: Phaser.GameObjects.Text;
    private bodyText!: Phaser.GameObjects.Text;
    private portrait: Phaser.GameObjects.Image | null = null;
    private advanceIndicator!: Phaser.GameObjects.Text;

    private lines: DialogLine[] = [];
    private lineIndex = 0;
    private charIndex = 0;
    private typewriterTimer: Phaser.Time.TimerEvent | null = null;
    private isTyping = false;
    private isVisible = false;

    private readonly boxW: number;
    private readonly boxH: number;
    private readonly boxX: number;
    private readonly boxY: number;
    private readonly padding = 20;
    private readonly typeSpeed = 30; // ms per character

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.boxW = GAME_WIDTH - 40;
        this.boxH = 120;
        this.boxX = GAME_WIDTH / 2;
        this.boxY = GAME_HEIGHT - this.boxH / 2 - 16;

        this.container = scene.add.container(this.boxX, this.boxY)
            .setScrollFactor(0)
            .setDepth(350)
            .setVisible(false);

        this.buildBox();

        EventBus.on(THEME_CHANGED, this.onThemeChanged, this);
    }

    private buildBox(): void {
        const tm = ThemeManager.getInstance();
        const halfW = this.boxW / 2;
        const halfH = this.boxH / 2;

        // Background
        this.boxBg = this.scene.add.graphics();
        this.drawBackground();
        this.container.add(this.boxBg);

        // Portrait placeholder area (left side)
        const portraitSize = this.boxH - 24;
        const portraitX = -halfW + this.padding + portraitSize / 2;

        // Speaker name
        this.nameText = this.scene.add.text(
            -halfW + this.padding + portraitSize + 16,
            -halfH + 12,
            '',
            {
                fontSize: '20px',
                fontFamily: 'monospace',
                color: tm.getTheme().dialog.nameColor || tm.getColor('accent'),
                stroke: '#000000',
                strokeThickness: 2,
            },
        ).setOrigin(0, 0);
        this.container.add(this.nameText);

        // Body text
        this.bodyText = this.scene.add.text(
            -halfW + this.padding + portraitSize + 16,
            -halfH + 40,
            '',
            {
                fontSize: '20px',
                fontFamily: 'monospace',
                color: tm.getTheme().dialog.textColor || tm.getColor('textColor'),
                stroke: '#000000',
                strokeThickness: 2,
                wordWrap: { width: this.boxW - portraitSize - this.padding * 3 - 16 },
                lineSpacing: 4,
            },
        ).setOrigin(0, 0);
        this.container.add(this.bodyText);

        // Advance indicator (blinking triangle)
        this.advanceIndicator = this.scene.add.text(
            halfW - this.padding - 8,
            halfH - this.padding - 4,
            '▼',
            {
                fontSize: '20px',
                fontFamily: 'monospace',
                color: tm.getColor('accent'),
            },
        ).setOrigin(1, 1).setAlpha(0);
        this.container.add(this.advanceIndicator);

        // Blinking tween for advance indicator
        this.scene.tweens.add({
            targets: this.advanceIndicator,
            alpha: { from: 0.3, to: 1 },
            duration: 500,
            yoyo: true,
            repeat: -1,
        });
    }

    private drawBackground(): void {
        const tm = ThemeManager.getInstance();
        const halfW = this.boxW / 2;
        const halfH = this.boxH / 2;

        this.boxBg.clear();

        // Outer border
        this.boxBg.fillStyle(tm.getColorNum('boardBorder'), 0.95);
        this.boxBg.fillRoundedRect(-halfW - 4, -halfH - 4, this.boxW + 8, this.boxH + 8, 12);

        // Inner fill
        this.boxBg.fillStyle(tm.getColorNum('boardBg'), 0.92);
        this.boxBg.fillRoundedRect(-halfW, -halfH, this.boxW, this.boxH, 8);
    }

    /** Show a dialog sequence */
    show(lines: DialogLine[]): void {
        if (lines.length === 0) return;

        this.lines = lines;
        this.lineIndex = 0;
        this.isVisible = true;
        this.container.setVisible(true);

        // Slide in from bottom
        this.container.setY(GAME_HEIGHT + this.boxH);
        this.scene.tweens.add({
            targets: this.container,
            y: this.boxY,
            duration: 200,
            ease: 'Back.easeOut',
        });

        this.showLine(0);

        EventBus.emit(GameEvents.DIALOG_START);
    }

    private showLine(index: number): void {
        if (index >= this.lines.length) {
            this.hide();
            return;
        }

        const line = this.lines[index];
        this.nameText.setText(line.speaker);
        this.bodyText.setText('');
        this.advanceIndicator.setVisible(false);
        this.charIndex = 0;
        this.isTyping = true;

        // Update portrait if provided
        this.updatePortrait(line.portraitKey);

        // Typewriter effect
        if (this.typewriterTimer) {
            this.typewriterTimer.destroy();
        }

        this.typewriterTimer = this.scene.time.addEvent({
            delay: this.typeSpeed,
            repeat: line.text.length - 1,
            callback: () => {
                this.charIndex++;
                this.bodyText.setText(line.text.substring(0, this.charIndex));

                if (this.charIndex >= line.text.length) {
                    this.isTyping = false;
                    this.advanceIndicator.setVisible(true);
                }
            },
        });
    }

    private updatePortrait(portraitKey?: string): void {
        if (this.portrait) {
            this.portrait.destroy();
            this.portrait = null;
        }

        const halfW = this.boxW / 2;
        const portraitSize = this.boxH - 24;
        const px = -halfW + this.padding + portraitSize / 2;

        if (portraitKey && this.scene.textures.exists(portraitKey)) {
            this.portrait = this.scene.add.image(px, 0, portraitKey)
                .setDisplaySize(portraitSize, portraitSize);
            this.container.add(this.portrait);
        } else {
            // Placeholder portrait: colored rectangle with first letter
            const tm = ThemeManager.getInstance();
            const speaker = this.lines[this.lineIndex]?.speaker || '?';
            const gfx = this.scene.add.graphics();
            gfx.fillStyle(tm.getColorNum('secondary'), 1);
            gfx.fillRoundedRect(px - portraitSize / 2, -portraitSize / 2, portraitSize, portraitSize, 3);
            gfx.lineStyle(1, 0xffffff, 0.3);
            gfx.strokeRoundedRect(px - portraitSize / 2, -portraitSize / 2, portraitSize, portraitSize, 3);
            this.container.add(gfx);

            const letter = this.scene.add.text(px, 0, speaker.charAt(0).toUpperCase(), {
                fontSize: '40px',
                fontFamily: 'monospace',
                color: '#ffffff',
            }).setOrigin(0.5, 0.5);
            this.container.add(letter);
        }
    }

    /** Call this when the player presses interact/tap to advance dialog */
    advance(): void {
        if (!this.isVisible) return;

        if (this.isTyping) {
            // Skip typewriter - show full text immediately
            if (this.typewriterTimer) {
                this.typewriterTimer.destroy();
                this.typewriterTimer = null;
            }
            const line = this.lines[this.lineIndex];
            this.bodyText.setText(line.text);
            this.isTyping = false;
            this.advanceIndicator.setVisible(true);
            return;
        }

        // Move to next line
        this.lineIndex++;
        EventBus.emit(GameEvents.DIALOG_ADVANCE, this.lineIndex);

        if (this.lineIndex >= this.lines.length) {
            this.hide();
        } else {
            this.showLine(this.lineIndex);
        }
    }

    /** Hide the dialog box with slide-out animation */
    hide(): void {
        if (!this.isVisible) return;
        this.isVisible = false;

        if (this.typewriterTimer) {
            this.typewriterTimer.destroy();
            this.typewriterTimer = null;
        }

        this.scene.tweens.add({
            targets: this.container,
            y: GAME_HEIGHT + this.boxH,
            duration: 150,
            ease: 'Power2',
            onComplete: () => {
                this.container.setVisible(false);
                EventBus.emit(GameEvents.DIALOG_END);
            },
        });
    }

    getIsVisible(): boolean {
        return this.isVisible;
    }

    private onThemeChanged = (): void => {
        this.drawBackground();
        const tm = ThemeManager.getInstance();
        this.nameText.setColor(tm.getTheme().dialog.nameColor || tm.getColor('accent'));
        this.bodyText.setColor(tm.getTheme().dialog.textColor || tm.getColor('textColor'));
    };

    destroy(): void {
        EventBus.off(THEME_CHANGED, this.onThemeChanged, this);
        if (this.typewriterTimer) this.typewriterTimer.destroy();
        this.container.destroy(true);
    }
}
