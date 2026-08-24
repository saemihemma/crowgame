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
    private wrongAttempts = 0;
    private correctButton: Phaser.GameObjects.Container | null = null;
    private hintTween: Phaser.Tweens.Tween | null = null;

    private readonly boardW = 520;

    /**
     * Board height. Grows to fit its content rather than clipping it.
     *
     * Everything on this board used to sit at a fixed offset, so a prompt that
     * wrapped to two lines pushed the answer buttons into the hint. The board
     * now measures question, buttons and hint and sizes itself around them.
     */
    private boardH = MathBoard.MIN_BOARD_H;

    /** Question type scale, largest first. See brand/BRAND_SYSTEM.md section 7.2. */
    private static readonly QUESTION_SIZES = [56, 44, 36, 28] as const;

    /** Question band before the type scale steps down. Two lines at 56px. */
    private static readonly QUESTION_BAND_H = 130;

    private static readonly OPTION_W = 100;
    private static readonly OPTION_H = 60;

    /** Vertical rhythm, measured from the inside of the board's top edge. */
    private static readonly MIN_BOARD_H = 280;
    private static readonly PAD_TOP = 34;
    private static readonly GAP_QUESTION_OPTIONS = 24;
    private static readonly GAP_OPTIONS_HINT = 14;
    private static readonly PAD_BOTTOM = 26;

    /** One lockout for every problem type. brand/BRAND_SYSTEM.md section 8.4. */
    private static readonly WRONG_LOCKOUT_MS = 900;
    private static readonly WRONG_PICK_ALPHA = 0.45;
    private static readonly WRONG_DIM_ALPHA = 0.55;

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
        }).setOrigin(0.5, 0).setAlpha(0);   // top-anchored: layout() positions its top edge
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
        for (const size of MathBoard.QUESTION_SIZES) {
            this.questionText.setFontSize(size);
            this.questionText.setWordWrapWidth(this.boardW - 48, true);
            this.questionText.setText(text);
            if (this.questionText.height <= MathBoard.QUESTION_BAND_H) {
                break;
            }
        }
        return this.questionText.height;
    }

    /**
     * Size the board to its content and position question, options and hint
     * down a single vertical rhythm.
     *
     * Returns the y the option row should sit at. Called before the options are
     * built, because their position depends on how tall the question came out.
     */
    private layout(questionHeight: number, hintHeight: number): number {
        const optionsTop = MathBoard.PAD_TOP + questionHeight + MathBoard.GAP_QUESTION_OPTIONS;
        const hintTop = optionsTop + MathBoard.OPTION_H
            + (hintHeight > 0 ? MathBoard.GAP_OPTIONS_HINT : 0);
        const contentH = hintTop + hintHeight + MathBoard.PAD_BOTTOM;

        this.boardH = Math.max(MathBoard.MIN_BOARD_H, contentH);
        this.drawBoardBackground(this.boardW, this.boardH);

        const top = -this.boardH / 2;
        this.questionText.setY(top + MathBoard.PAD_TOP);
        this.hintText.setY(top + hintTop);

        return top + optionsTop + MathBoard.OPTION_H / 2;
    }

    /** Set the hint and report its height, without revealing it yet. */
    private prepareHint(hint: string | undefined): number {
        if (!hint) {
            this.hintText.setText('').setAlpha(0);
            return 0;
        }
        this.hintText.setText(hint).setAlpha(0);
        return this.hintText.height;
    }

    /** Show a math problem with MCQ options */
    showProblem(problem: MathProblem): void {
        this.currentProblem = problem;
        this.answered = false;
        this.wrongAttempts = 0;
        this.correctButton = null;
        this.hintTween?.remove();
        this.hintTween = null;

        // Set question text, shrinking it until it fits the question band. A
        // counting prompt renders one glyph per item, so 56px does not always
        // fit; without this the wrap pushes it down into the answer buttons.
        const questionHeight = this.fitQuestionText(problem.prompt.text);
        const hintHeight = this.prepareHint(problem.hint);
        const btnY = this.layout(questionHeight, hintHeight);

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
            const btnW = MathBoard.OPTION_W;
            const btnH = MathBoard.OPTION_H;
            const gap = 24;
            const totalW = options.length * btnW + (options.length - 1) * gap;
            const startX = -totalW / 2 + btnW / 2;

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
                if (optVal === mcqAnswer.correct) {
                    this.correctButton = btn;
                }

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

    /** Redraw an option background. One painter, so the states cannot drift. */
    private drawOptionBackground(
        bg: Phaser.GameObjects.Graphics,
        fill: number,
        stroke: number,
        strokeAlpha: number,
    ): void {
        const w = MathBoard.OPTION_W;
        const h = MathBoard.OPTION_H;
        bg.clear();
        bg.fillStyle(fill, 1);
        bg.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
        bg.lineStyle(4, stroke, strokeAlpha);
        bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    }

    /** Slow white rim pulse on the correct option, as a hint after one miss. */
    private breatheCorrectOption(): void {
        const target = this.correctButton;
        if (!target) {
            return;
        }
        const bg = target.getAt(0) as Phaser.GameObjects.Graphics | undefined;
        if (!bg) {
            return;
        }
        const tm = ThemeManager.getInstance();
        this.drawOptionBackground(bg, tm.getColorNum('buttonBg'), 0xffffff, 1);
        this.hintTween?.remove();
        this.hintTween = this.scene.tweens.add({
            targets: target,
            alpha: { from: 0.7, to: 1 },
            duration: 900,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
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
        this.stopHintBreathe();
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

    /**
     * The wrong-answer choreography, specified in brand/BRAND_SYSTEM.md section 8.4.
     *
     * The point of this 900ms is that being wrong must not feel like being hurt.
     * Three rules it exists to enforce:
     *
     * - **Amber, never red.** `notyet` is the try-again colour; `hurt` red is
     *   reserved for losing health. A six-year-old should never see the colour of
     *   damage on a maths answer.
     * - **The buttons visibly stop accepting input.** They used to stay fully lit
     *   through the lockout, so a child who retried immediately got silence.
     * - **One duration for every problem type**, so the beat is learnable.
     *
     * Nothing here costs the player health, coins, streak or progress. The only
     * cost of a wrong answer is 900ms of adventure.
     */
    private stopHintBreathe(): void {
        this.hintTween?.remove();
        this.hintTween = null;
        for (const option of this.optionButtons) {
            option.setAlpha(1);
        }
    }

    private onWrongAnswer(btn: Phaser.GameObjects.Container): void {
        this.stopHintBreathe();
        const tt = TextManager.getInstance();
        const tm = ThemeManager.getInstance();

        DopamineFX.wrongShake(this.scene, btn);

        // Every button drops out of the lit state, so the lockout is visible.
        for (const option of this.optionButtons) {
            this.scene.tweens.add({
                targets: option,
                alpha: option === btn ? MathBoard.WRONG_PICK_ALPHA : MathBoard.WRONG_DIM_ALPHA,
                duration: 120,
            });
        }

        // Amber rim on the pick. Redrawn rather than tinted because the button
        // background is a Graphics object, which does not take a tint.
        const bg = btn.getAt(0) as Phaser.GameObjects.Graphics | undefined;
        if (bg) {
            this.drawOptionBackground(bg, tm.getColorNum('buttonBg'), tm.getColorNum('notyet'), 1);
        }

        DopamineFX.numberFlyUp(
            this.scene,
            this.container.x,
            this.container.y - this.boardH / 2 - 20,
            tt.t('math.try_again'),
            tm.getColor('notyet'),
            0,
        );

        // The hint is already laid out and measured; the board reserved room for
        // it when the problem was shown. Revealing it cannot move anything.
        if (this.currentProblem?.hint) {
            this.scene.time.delayedCall(200, () => {
                this.scene.tweens.add({ targets: this.hintText, alpha: 1, duration: 200 });
            });
        }

        // After the first miss only, point at the answer with the game's
        // universal "press here" signal - `focus` white, not amber. Amber already
        // means "the one you picked was not it".
        this.wrongAttempts++;
        if (this.wrongAttempts === 1) {
            this.scene.time.delayedCall(400, () => this.breatheCorrectOption());
        }

        this.scene.time.delayedCall(MathBoard.WRONG_LOCKOUT_MS, () => {
            for (const option of this.optionButtons) {
                this.scene.tweens.add({ targets: option, alpha: 1, duration: 140 });
            }
            const pickBg = btn.getAt(0) as Phaser.GameObjects.Graphics | undefined;
            if (pickBg) {
                this.drawOptionBackground(pickBg, tm.getColorNum('buttonBg'), 0xffffff, 0.3);
            }
            this.answered = false;
            this.navigator.enable();
        });
    }

    /** Dismiss the board with an exit animation */
    dismiss(onComplete?: () => void): void {
        this.hintTween?.remove();
        this.hintTween = null;
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
        this.hintTween?.remove();
        this.hintTween = null;
        this.navigator.destroy();
        EventBus.off(THEME_CHANGED, this.onThemeChanged, this);
        this.container.destroy(true);
    }
}
