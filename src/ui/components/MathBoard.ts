import { ThemeManager, THEME_CHANGED } from '../theme/ThemeManager';
import { DopamineFX } from '../fx/DopamineFX';
import { UINavigator } from '../UINavigator';
import { EventBus } from '../../utils/EventBus';
import { GAME_WIDTH, GAME_HEIGHT } from '../../utils/Constants';
import { TextManager } from '../../systems/TextManager';
import type { MathProblem, MCQAnswer } from '../../utils/Types';

/**
 * Themed math question board UI component.
 * Displays a question + MCQ option buttons with themed styling.
 * Emits 'math-answer-selected' with { problemId, selectedAnswer, isCorrect }.
 */
export class MathBoard {
    private scene: Phaser.Scene;
    private container: Phaser.GameObjects.Container;
    private boardBg!: Phaser.GameObjects.Graphics;
    private questionText!: Phaser.GameObjects.Text;
    private optionButtons: Phaser.GameObjects.Container[] = [];
    private hintText!: Phaser.GameObjects.Text;
    private navigator: UINavigator;
    private currentProblem: MathProblem | null = null;
    private answered = false;

    private readonly boardW = 520;
    private readonly boardH = 280;

    /** Question type scale, largest first. See brand/BRAND_SYSTEM.md section 7.2. */
    private static readonly QUESTION_SIZES = [56, 44, 36, 28] as const;

    constructor(scene: Phaser.Scene, cx?: number, cy?: number) {
        this.scene = scene;
        const x = cx ?? GAME_WIDTH / 2;
        const y = cy ?? GAME_HEIGHT / 2;
        this.container = scene.add.container(x, y).setDepth(400);
        this.container.setScale(0); // Start hidden
        this.navigator = new UINavigator(scene, 'horizontal');

        this.buildBoard();

        EventBus.on(THEME_CHANGED, this.onThemeChanged, this);
    }

    private buildBoard(): void {
        const tm = ThemeManager.getInstance();

        // Board background
        this.boardBg = this.scene.add.graphics();
        this.drawBoardBackground(this.boardW, this.boardH);
        this.container.add(this.boardBg);

        // Question text (larger font for readability)
        this.questionText = this.scene.add.text(0, -this.boardH / 2 + 50, '', {
            fontSize: '56px',
            fontFamily: tm.getTheme().hud.font || 'monospace',
            color: tm.getColor('textColor'),
            stroke: tm.getColor('textShadow'),
            strokeThickness: 5,
            align: 'center',
            // Counting prompts render one glyph per item, so they outgrow the
            // board on the horizontal. Wrap inside the frame instead.
            wordWrap: { width: this.boardW - 48, useAdvancedWrap: true },
        }).setOrigin(0.5, 0);
        this.container.add(this.questionText);

        // Hint text (hidden initially, larger for readability)
        this.hintText = this.scene.add.text(0, this.boardH / 2 - 30, '', {
            fontSize: '24px',
            fontFamily: 'monospace',
            color: tm.getColor('accent'),
            stroke: '#000000',
            strokeThickness: 3,
            align: 'center',
            wordWrap: { width: this.boardW - 60 },
        }).setOrigin(0.5, 1).setAlpha(0);
        this.container.add(this.hintText);
    }

    private drawBoardBackground(w: number, h: number): void {
        const tm = ThemeManager.getInstance();
        this.boardBg.clear();

        // Outer border
        this.boardBg.fillStyle(tm.getColorNum('boardBorder'), 1);
        this.boardBg.fillRoundedRect(-w / 2 - 8, -h / 2 - 8, w + 16, h + 16, 16);

        // Inner background
        this.boardBg.fillStyle(tm.getColorNum('boardBg'), 1);
        this.boardBg.fillRoundedRect(-w / 2, -h / 2, w, h, 12);
    }

    /**
     * Set the question text at the largest size in the type scale that fits the
     * question band, and return its bottom edge in container space.
     *
     * The band is the space above the answer buttons. Steps come from the type
     * scale in brand/BRAND_SYSTEM.md section 7.2 rather than a continuous
     * fit, so text stays on-scale.
     */
    private fitQuestionText(text: string): number {
        const top = -this.boardH / 2 + 50;
        const band = 130;

        for (const size of MathBoard.QUESTION_SIZES) {
            this.questionText.setFontSize(size);
            this.questionText.setWordWrapWidth(this.boardW - 48, true);
            this.questionText.setText(text);
            if (this.questionText.height <= band) {
                break;
            }
        }

        this.questionText.setY(top);
        return top + this.questionText.height;
    }

    /** Show a math problem with MCQ options */
    showProblem(problem: MathProblem): void {
        this.currentProblem = problem;
        this.answered = false;

        // Set question text, shrinking it until it fits the question band. A
        // counting prompt renders one glyph per item, so 56px does not always
        // fit; without this the wrap pushes it down into the answer buttons.
        const questionBottom = this.fitQuestionText(problem.prompt.text);
        this.hintText.setText('').setAlpha(0);

        // Clear old option buttons
        this.optionButtons.forEach(b => b.destroy(true));
        this.optionButtons = [];

        // Clear navigator for new problem
        this.navigator.disable();
        this.navigator.clearButtons();

        // Create MCQ option buttons
        if (problem.answer.mode === 'mcq') {
            const mcqAnswer = problem.answer as MCQAnswer;
            const options = mcqAnswer.options;
            const btnW = 100;
            const btnH = 60;
            const gap = 24;
            const totalW = options.length * btnW + (options.length - 1) * gap;
            const startX = -totalW / 2 + btnW / 2;
            // Buttons sit under the measured question, not at a fixed y, so a
            // two-line prompt cannot collide with them.
            const btnY = Math.max(40, questionBottom + 24 + btnH / 2);

            for (let i = 0; i < options.length; i++) {
                const optVal = options[i];
                const btnX = startX + i * (btnW + gap);
                const btn = this.createOptionButton(
                    btnX,
                    btnY,
                    btnW,
                    btnH,
                    String(optVal),
                    optVal,
                    mcqAnswer.correct,
                );
                this.container.add(btn);
                this.optionButtons.push(btn);

                // Register with keyboard navigator (world coordinates)
                const zone = btn.getAt(2) as Phaser.GameObjects.Zone;
                const navIndex = i;
                this.navigator.addButton({
                    x: this.container.x + btnX,
                    y: this.container.y + btnY,
                    width: btnW,
                    height: btnH,
                    onActivate: () => zone.emit('pointerdown'),
                });
                zone.on('pointerover', () => this.navigator.setFocus(navIndex));
            }
        }

        // Elastic entrance animation
        DopamineFX.elasticEntrance(this.scene, this.container, 400);

        // Enable keyboard navigation after entrance animation
        this.scene.time.delayedCall(450, () => this.navigator.enable());
    }

    private createOptionButton(
        x: number,
        y: number,
        w: number,
        h: number,
        label: string,
        value: number,
        correctValue: number,
    ): Phaser.GameObjects.Container {
        const tm = ThemeManager.getInstance();
        const btnContainer = this.scene.add.container(x, y);

        // Button background
        const bg = this.scene.add.graphics();
        bg.fillStyle(tm.getColorNum('buttonBg'), 1);
        bg.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
        bg.lineStyle(4, 0xffffff, 0.3);
        bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
        btnContainer.add(bg);

        // Label (no brackets)
        const text = this.scene.add.text(0, 0, label, {
            fontSize: '28px',
            fontFamily: 'monospace',
            color: tm.getColor('buttonText'),
            stroke: '#000000',
            strokeThickness: 2,
        }).setOrigin(0.5, 0.5);
        btnContainer.add(text);

        // Interactive zone
        const zone = this.scene.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
        btnContainer.add(zone);

        // Click handler
        zone.on('pointerdown', () => {
            if (this.answered) return;
            this.answered = true;
            this.navigator.disable();

            const isCorrect = value === correctValue;

            if (isCorrect) {
                this.onCorrectAnswer(btnContainer);
            } else {
                this.onWrongAnswer(btnContainer);
            }

            EventBus.emit('math-answer-selected', {
                problemId: this.currentProblem?.id,
                selectedAnswer: value,
                isCorrect,
            });
        });

        // Hover effect
        zone.on('pointerover', () => {
            if (!this.answered) {
                this.scene.tweens.add({
                    targets: btnContainer,
                    scaleX: 1.1,
                    scaleY: 1.1,
                    duration: 80,
                });
            }
        });

        zone.on('pointerout', () => {
            if (!this.answered) {
                this.scene.tweens.add({
                    targets: btnContainer,
                    scaleX: 1,
                    scaleY: 1,
                    duration: 80,
                });
            }
        });

        return btnContainer;
    }

    private onCorrectAnswer(btn: Phaser.GameObjects.Container): void {
        const tt = TextManager.getInstance();

        // Green flash on the correct button
        DopamineFX.correctFlash(this.scene, btn);

        // Tint button green to clearly mark correct answer
        const bg = btn.getAt(0) as Phaser.GameObjects.Graphics;
        if (bg) {
            bg.clear();
            bg.fillStyle(0x44cc44, 1);
            bg.fillRoundedRect(-50, -30, 100, 60, 8);
            bg.lineStyle(4, 0xffffff, 0.6);
            bg.strokeRoundedRect(-50, -30, 100, 60, 8);
        }

        // Celebration burst from the button position
        const worldX = this.container.x + btn.x;
        const worldY = this.container.y + btn.y;
        DopamineFX.celebrationBurst(this.scene, worldX, worldY);

        // Second burst from center of board for extra impact
        this.scene.time.delayedCall(150, () => {
            DopamineFX.celebrationBurst(this.scene, this.container.x, this.container.y);
        });

        // Screen flash
        DopamineFX.screenFlash(this.scene, 0x44ff44, 250);

        // Big "Correct!" fly up text
        DopamineFX.numberFlyUp(
            this.scene,
            this.container.x,
            this.container.y - this.boardH / 2 - 30,
            tt.t('math.correct_label'),
            '#44ff44',
            0,
        );

        // Bouncy pulse on the entire board
        this.scene.tweens.add({
            targets: this.container,
            scaleX: 1.08,
            scaleY: 1.08,
            duration: 150,
            yoyo: true,
            repeat: 2,
            ease: 'Back.easeOut',
        });

        // Scale up the correct button for emphasis
        this.scene.tweens.add({
            targets: btn,
            scaleX: 1.3,
            scaleY: 1.3,
            duration: 200,
            ease: 'Back.easeOut',
        });
    }

    private onWrongAnswer(btn: Phaser.GameObjects.Container): void {
        const tt = TextManager.getInstance();

        // Shake the wrong button
        DopamineFX.wrongShake(this.scene, btn);

        // Tint button red briefly
        const bg = btn.getAt(0) as Phaser.GameObjects.Graphics;
        if (bg) {
            // Redraw bg red
            const tm = ThemeManager.getInstance();
            bg.clear();
            bg.fillStyle(tm.getColorNum('danger'), 1);
            bg.fillRoundedRect(-50, -30, 100, 60, 8);

            // Revert after delay
            this.scene.time.delayedCall(400, () => {
                bg.clear();
                bg.fillStyle(tm.getColorNum('buttonBg'), 1);
                bg.fillRoundedRect(-50, -30, 100, 60, 8);
                bg.lineStyle(4, 0xffffff, 0.3);
                bg.strokeRoundedRect(-50, -30, 100, 60, 8);
            });
        }

        // "Try again" text
        DopamineFX.numberFlyUp(
            this.scene,
            this.container.x,
            this.container.y - this.boardH / 2 - 20,
            tt.t('math.try_again'),
            '#ff6666',
            0,
        );

        // Show hint text if available
        if (this.currentProblem?.hint) {
            this.hintText.setText(this.currentProblem.hint);
            this.scene.tweens.add({
                targets: this.hintText,
                alpha: 1,
                duration: 300,
            });
        }

        // Allow retry after a brief delay
        this.scene.time.delayedCall(600, () => {
            this.answered = false;
            this.navigator.enable();
        });
    }

    /** Dismiss the board with an exit animation */
    dismiss(onComplete?: () => void): void {
        this.navigator.disable();
        DopamineFX.elasticExit(this.scene, this.container, 250, () => {
            onComplete?.();
        });
    }

    private onThemeChanged = (): void => {
        this.drawBoardBackground(this.boardW, this.boardH);

        const tm = ThemeManager.getInstance();
        this.questionText.setColor(tm.getColor('textColor'));
        this.questionText.setStroke(tm.getColor('textShadow'), 4);
    };

    destroy(): void {
        this.navigator.destroy();
        EventBus.off(THEME_CHANGED, this.onThemeChanged, this);
        this.container.destroy(true);
    }
}
