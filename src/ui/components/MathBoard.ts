import { ThemeManager, THEME_CHANGED } from '../theme/ThemeManager';
import { DopamineFX } from '../fx/DopamineFX';
import { UINavigator } from '../UINavigator';
import { EventBus, GameEvents } from '../../utils/EventBus';
import { GAME_WIDTH, GAME_HEIGHT } from '../../utils/Constants';
import { TextManager } from '../../systems/TextManager';
import type { MathProblem, MCQAnswer } from '../../utils/Types';
import { localisedExplanation, localisedHint, localisedPrompt } from '../../math/problemPhrasing';

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
    private optionValues: number[] = [];
    private hintText!: Phaser.GameObjects.Text;
    private navigator: UINavigator;
    private currentProblem: MathProblem | null = null;
    private answered = false;
    private revealed = false;
    private inputLocked = false;

    private readonly boardW = 520;
    private readonly boardH = 280;

    /**
     * The question's box.
     *
     * A font size picked from the prompt's character count is a guess, and it was
     * guessing against measured data: 2050 of the 3000 English prompts overflow a
     * fixed 56px in a 520px board, the longest by about 2400px -- two and a half
     * times the whole canvas. Icelandic is not what breaks this (its longest
     * prompt is one character longer) but it does mean a guess is not good enough,
     * because the same character count is a different width in another language.
     *
     * So the size is measured instead: wrap, measure the rendered height, and step
     * down until it fits. tools/validate_i18n.mjs proves every prompt and hint in
     * both locales fits at the floor, which is what makes the floor unreachable.
     *
     * The band runs from the text's top edge to the option buttons, which sit at
     * local y 40 with height 60, so their top edge is at 10.
     */
    private static readonly QUESTION_MAX_SIZE = 56;
    private static readonly QUESTION_MIN_SIZE = 20;
    private static readonly QUESTION_MAX_W = 460;
    private static readonly QUESTION_MAX_H = 96;

    /**
     * The hint's box, which used to be inside the board and could not work there.
     *
     * The hint was anchored bottom-up at local y 110, leaving 40px of clearance
     * above the option buttons. A two-line hint at 24px is 58px and a three-line
     * one is 86px, so it drew straight over the answers -- and that was already
     * true in English: "You have 8, take away 5. Think: 5 + 3 = 8, so 3 are left!"
     * is 57 characters. Covering the buttons at the moment a child has answered
     * wrong and is reaching for another one is about the worst place for it.
     *
     * The board is 280 tall and centred at y 310 on a 540 canvas, so it ends at
     * 450 and the 90px below it is empty. The hint lives there now.
     */
    private static readonly HINT_MAX_SIZE = 24;
    private static readonly HINT_MIN_SIZE = 16;
    private static readonly HINT_MAX_H = 72;

    constructor(scene: Phaser.Scene, cx?: number, cy?: number) {
        this.scene = scene;
        const x = cx ?? GAME_WIDTH / 2;
        const y = cy ?? GAME_HEIGHT / 2;
        this.container = scene.add.container(x, y).setDepth(400);
        this.container.setScale(0); // Start hidden
        this.navigator = new UINavigator(scene, 'horizontal');

        this.buildBoard();

        EventBus.on(THEME_CHANGED, this.onThemeChanged, this);
        EventBus.on(GameEvents.LOCALE_CHANGED, this.onLocaleChanged, this);
    }

    private buildBoard(): void {
        const tm = ThemeManager.getInstance();

        // Board background
        this.boardBg = this.scene.add.graphics();
        this.drawBoardBackground(this.boardW, this.boardH);
        this.container.add(this.boardBg);

        // Question text. Word-wrapped and auto-sized -- see fitInto().
        this.questionText = this.scene.add.text(0, -this.boardH / 2 + 44, '', {
            fontSize: `${MathBoard.QUESTION_MAX_SIZE}px`,
            fontFamily: tm.getTheme().hud.font || 'monospace',
            color: tm.getColor('textColor'),
            stroke: tm.getColor('textShadow'),
            strokeThickness: 5,
            align: 'center',
            wordWrap: { width: MathBoard.QUESTION_MAX_W },
        }).setOrigin(0.5, 0);
        this.container.add(this.questionText);

        // Hint text: below the board, hidden until a wrong answer. Auto-sized.
        this.hintText = this.scene.add.text(0, this.boardH / 2 + 16, '', {
            fontSize: `${MathBoard.HINT_MAX_SIZE}px`,
            fontFamily: 'monospace',
            color: tm.getColor('accent'),
            stroke: '#000000',
            strokeThickness: 3,
            align: 'center',
            wordWrap: { width: MathBoard.QUESTION_MAX_W },
        }).setOrigin(0.5, 0).setAlpha(0);
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

    /** Show a math problem with MCQ options */
    showProblem(problem: MathProblem): void {
        this.currentProblem = problem;
        this.answered = false;
        this.revealed = false;
        this.inputLocked = false;

        // Set the question in the active locale, measured to fit its band.
        MathBoard.fitInto(
            this.questionText, localisedPrompt(problem),
            MathBoard.QUESTION_MAX_SIZE, MathBoard.QUESTION_MIN_SIZE, MathBoard.QUESTION_MAX_H,
        );
        this.hintText.setText('').setAlpha(0);

        // Clear old option buttons
        this.optionButtons.forEach(b => b.destroy(true));
        this.optionButtons = [];
        this.optionValues = [];

        // Clear navigator for new problem
        this.navigator.disable();
        this.navigator.clearButtons();

        // Create MCQ option buttons
        if (problem.answer.mode === 'mcq') {
            const mcqAnswer = problem.answer as MCQAnswer;
            // Shuffle a copy so the correct answer's on-screen position is
            // random. The authored data heavily favors the last slot, which
            // kids learn to exploit.
            const options = [...mcqAnswer.options];
            for (let i = options.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [options[i], options[j]] = [options[j], options[i]];
            }
            const btnW = 100;
            const btnH = 60;
            const gap = 24;
            const totalW = options.length * btnW + (options.length - 1) * gap;
            const startX = -totalW / 2 + btnW / 2;

            for (let i = 0; i < options.length; i++) {
                const optVal = options[i];
                const btnX = startX + i * (btnW + gap);
                const btn = this.createOptionButton(
                    btnX,
                    40,
                    btnW,
                    btnH,
                    String(optVal),
                    optVal,
                    mcqAnswer.correct,
                );
                this.container.add(btn);
                this.optionButtons.push(btn);
                this.optionValues.push(optVal);

                // Register with keyboard navigator (world coordinates)
                const zone = btn.getAt(2) as Phaser.GameObjects.Zone;
                const navIndex = i;
                this.navigator.addButton({
                    x: this.container.x + btnX,
                    y: this.container.y + 40,
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
        this.scene.time.delayedCall(450, () => {
            if (!this.inputLocked) this.navigator.enable();
        });
    }

    /** Block answering entirely — the worked-example demo shows, it never asks. */
    lockInput(): void {
        this.inputLocked = true;
        this.answered = true;
        this.navigator.disable();
    }

    /** Show the localised hint line (the demo choreography reuses the miss-hint slot). */
    showHintLine(): void {
        const hint = this.currentProblem ? localisedHint(this.currentProblem) : undefined;
        if (!hint) return;
        MathBoard.fitInto(
            this.hintText, hint,
            MathBoard.HINT_MAX_SIZE, MathBoard.HINT_MIN_SIZE, MathBoard.HINT_MAX_H,
        );
        this.scene.tweens.add({ targets: this.hintText, alpha: 1, duration: 300 });
    }

    /**
     * Set text at the largest size that fits its box.
     *
     * Wrapping alone is not enough: a 68-character prompt wrapped at 460px is
     * four lines at 56px, which is 269px of text in a 96px band -- straight
     * through the answer buttons. So step the size down until the wrapped block
     * fits, re-applying the text each time so Phaser re-measures.
     *
     * The floor is deliberate rather than a fallback to something tiny. Below it
     * the text stops being readable for a five-year-old, and a rare visible
     * overflow is a better failure than silently shrinking a maths question to
     * nothing. tools/validate_i18n.mjs checks that every string in both locales
     * fits at its floor, so hitting it should not happen.
     */
    private static fitInto(
        target: Phaser.GameObjects.Text,
        text: string,
        maxSize: number,
        minSize: number,
        maxH: number,
    ): void {
        for (let size = maxSize; size >= minSize; size -= 2) {
            target.setFontSize(size);
            target.setWordWrapWidth(MathBoard.QUESTION_MAX_W);
            target.setText(text);
            if (target.height <= maxH) return;
        }
    }

    /**
     * The question exactly as it is on screen, in the active locale.
     *
     * Exposed for the browser harnesses. The board draws to a WebGL canvas, so
     * nothing outside the game can read the text back -- which meant a smoke run
     * against an Icelandic build and an English one produced identical results,
     * and localisation was untestable end to end.
     */
    getRenderedQuestion(): string {
        return this.questionText.text;
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

        // Show hint text if available, in the active locale.
        const hint = this.currentProblem ? localisedHint(this.currentProblem) : undefined;
        if (hint) {
            MathBoard.fitInto(
                this.hintText, hint,
                MathBoard.HINT_MAX_SIZE, MathBoard.HINT_MIN_SIZE, MathBoard.HINT_MAX_H,
            );
            this.scene.tweens.add({
                targets: this.hintText,
                alpha: 1,
                duration: 300,
            });
        }

        // Allow retry after a brief delay (unless the answer was revealed)
        this.scene.time.delayedCall(600, () => {
            if (this.revealed) return;
            this.answered = false;
            this.navigator.enable();
        });
    }

    /**
     * After the final allowed miss: highlight the correct answer, dim the
     * rest, and show the authored explanation so the miss ends in learning.
     */
    revealAnswer(): void {
        if (!this.currentProblem || this.currentProblem.answer.mode !== 'mcq') return;
        this.revealed = true;
        this.answered = true;
        this.navigator.disable();

        const correct = (this.currentProblem.answer as MCQAnswer).correct;
        this.optionButtons.forEach((btn, i) => {
            const bg = btn.getAt(0) as Phaser.GameObjects.Graphics;
            if (!bg) return;
            if (this.optionValues[i] === correct) {
                bg.clear();
                bg.fillStyle(0x44cc44, 1);
                bg.fillRoundedRect(-50, -30, 100, 60, 8);
                bg.lineStyle(4, 0xffffff, 0.6);
                bg.strokeRoundedRect(-50, -30, 100, 60, 8);
                this.scene.tweens.add({
                    targets: btn,
                    scaleX: 1.2,
                    scaleY: 1.2,
                    duration: 250,
                    ease: 'Back.easeOut',
                });
            } else {
                btn.setAlpha(0.35);
            }
        });

        // The teaching moment after the final miss, in the active locale.
        const explanation = localisedExplanation(this.currentProblem)
            ?? localisedHint(this.currentProblem)
            ?? '';
        if (explanation) {
            MathBoard.fitInto(
                this.hintText, explanation,
                MathBoard.HINT_MAX_SIZE, MathBoard.HINT_MIN_SIZE, MathBoard.HINT_MAX_H,
            );
            this.hintText.setAlpha(0);
            this.scene.tweens.add({ targets: this.hintText, alpha: 1, duration: 300 });
        }
    }

    /** Dismiss the board with an exit animation */
    dismiss(onComplete?: () => void): void {
        this.navigator.disable();
        DopamineFX.elasticExit(this.scene, this.container, 250, () => {
            onComplete?.();
        });
    }

    /**
     * Re-render the question and hint in the new locale.
     *
     * This cannot reuse onThemeChanged the way TouchControls does: that handler
     * repaints colours and redraws the board, but never touches the text. So the
     * board would have kept its old-language question.
     *
     * Two things it must not do. It re-renders from `this.currentProblem` and
     * never asks for a new one -- swapping the problem under a child mid-answer
     * because they changed language would be a genuinely bad bug. And it goes
     * through fitInto() rather than setText(), because the size was measured for
     * the previous string and the new one is a different width; a raw setText
     * would leave a long Icelandic prompt overflowing the board.
     */
    private onLocaleChanged = (): void => {
        if (!this.currentProblem) return;

        MathBoard.fitInto(
            this.questionText, localisedPrompt(this.currentProblem),
            MathBoard.QUESTION_MAX_SIZE, MathBoard.QUESTION_MIN_SIZE, MathBoard.QUESTION_MAX_H,
        );

        // Only re-render the hint if one is already showing; otherwise this
        // would reveal it early.
        if (this.hintText.alpha > 0) {
            const hint = this.revealed
                ? (localisedExplanation(this.currentProblem) ?? localisedHint(this.currentProblem))
                : localisedHint(this.currentProblem);
            if (hint) {
                MathBoard.fitInto(
                    this.hintText, hint,
                    MathBoard.HINT_MAX_SIZE, MathBoard.HINT_MIN_SIZE, MathBoard.HINT_MAX_H,
                );
            }
        }
    };

    private onThemeChanged = (): void => {
        this.drawBoardBackground(this.boardW, this.boardH);

        const tm = ThemeManager.getInstance();
        this.questionText.setColor(tm.getColor('textColor'));
        this.questionText.setStroke(tm.getColor('textShadow'), 4);
    };

    destroy(): void {
        this.navigator.destroy();
        EventBus.off(THEME_CHANGED, this.onThemeChanged, this);
        EventBus.off(GameEvents.LOCALE_CHANGED, this.onLocaleChanged, this);
        this.container.destroy(true);
    }
}
