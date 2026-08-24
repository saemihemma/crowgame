import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT } from '../utils/Constants';
import { MathBoard } from '../ui/components/MathBoard';
import { EventBus, GameEvents } from '../utils/EventBus';
import { DopamineFX } from '../ui/fx/DopamineFX';
import { ThemeManager } from '../ui/theme/ThemeManager';
import { TextManager } from '../systems/TextManager';
import { AudioManager } from '../systems/AudioManager';
import { LearnerStateManager } from '../systems/LearnerStateManager';
import { mathTuning } from '../math/MathTuning';
import type { MathProblem } from '../utils/Types';

/**
 * Unified NPC-greeting + math-challenge overlay.
 *
 * Layout (single screen):
 * ┌──────────────────────────────┐
 * │  🦉 Professor Hoot          │
 * │  "Solve this to pass!"      │
 * │                              │
 * │       3  +  4  =  ?         │
 * │                              │
 * │   [ 5 ]  [ 7 ]  [ 6 ] [ 8] │
 * └──────────────────────────────┘
 *
 * Launch with:
 *   scene.launch(SCENES.MATH_CHALLENGE, {
 *     problem, coinsReward, npcName?, npcGreeting?
 *   })
 */
export class MathChallengeScene extends Phaser.Scene {
    private dimOverlay!: Phaser.GameObjects.Rectangle;
    private mathBoard!: MathBoard;
    private currentProblem!: MathProblem;
    private coinsReward = 1;
    private wrongAttempts = 0;
    private presentedAt = 0;
    private firstResponseMs = 0;
    // Worked-example mode: the owl demonstrates, the child only watches.
    private isDemo = false;
    // Freebie: the first-ever try at a newly introduced skill. A win counts
    // normally; a miss is never recorded against the learner.
    private isFreebie = false;
    // Golden: a seeded 1-in-N arrival with a bonus coin multiplier on a win.
    private isGolden = false;

    // NPC header elements
    private headerContainer!: Phaser.GameObjects.Container;

    constructor() {
        super({ key: SCENES.MATH_CHALLENGE });
    }

    create(data: {
        problem?: MathProblem;
        coinsReward?: number;
        npcName?: string;
        npcGreeting?: string;
        currentProblemIndex?: number;
        problemCount?: number;
        demo?: boolean;
        freebie?: boolean;
        golden?: boolean;
    }): void {
        if (!data.problem) {
            console.warn('MathChallengeScene: no problem provided, closing.');
            this.closeMathChallenge();
            return;
        }

        this.currentProblem = data.problem;
        this.coinsReward = data.coinsReward ?? 1;
        this.wrongAttempts = 0;
        this.presentedAt = Date.now();
        this.firstResponseMs = 0;
        this.isDemo = data.demo === true;
        this.isFreebie = data.freebie === true;
        this.isGolden = data.golden === true && !this.isDemo;

        // Pause the game scene and let the challenge own the screen.
        this.scene.pause(SCENES.GAME);
        this.scene.setVisible(false, SCENES.HUD);

        // Semi-transparent dim overlay
        this.dimOverlay = this.add.rectangle(
            GAME_WIDTH / 2, GAME_HEIGHT / 2,
            GAME_WIDTH, GAME_HEIGHT,
            0x000000, 0,
        ).setDepth(300).setScrollFactor(0);

        // Fade in dim
        this.tweens.add({
            targets: this.dimOverlay,
            fillAlpha: 0.62,
            duration: 200,
        });

        // Build the NPC header (above the math board)
        this.buildNPCHeader(
            data.npcName,
            data.npcGreeting,
            data.currentProblemIndex,
            data.problemCount,
        );

        // Create the math board (positioned slightly below center to make room for header)
        this.mathBoard = new MathBoard(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40);
        this.mathBoard.showProblem(this.currentProblem);

        if (this.isDemo) {
            // Worked example: no input, no learner-model events. The owl walks
            // through the problem in two beats — think aloud (hint), then the
            // answer with its explanation — and hands over with "Your turn!".
            this.mathBoard.lockInput();
            const teaching = mathTuning().teaching;
            this.time.delayedCall(teaching.hintMs, () => this.mathBoard.showHintLine());
            this.time.delayedCall(teaching.revealMs, () => this.mathBoard.revealAnswer());
            this.time.delayedCall(teaching.handoverMs, () => {
                DopamineFX.numberFlyUp(
                    this,
                    GAME_WIDTH / 2,
                    GAME_HEIGHT / 2 - 120,
                    TextManager.getInstance().t('math.demo_your_turn'),
                    '#ffd700',
                    0,
                );
            });
            this.time.delayedCall(teaching.closeMs, () => {
                EventBus.emit(GameEvents.MATH_DEMO_COMPLETE, {
                    problemId: this.currentProblem.id,
                    domain: this.currentProblem.domain,
                });
                this.closeMathChallenge();
            });
            return;
        }

        // Progress pips: the wins already banked toward the next level-up in
        // this problem's domain. The third pip is the step-up moment itself.
        this.drawProgressPips();

        if (this.isGolden) {
            this.decorateGolden();
        }

        // Listen for answer
        EventBus.on('math-answer-selected', this.onAnswerSelected, this);

        // Emit challenge start event
        EventBus.emit(GameEvents.MATH_CHALLENGE_START, {
            problemId: this.currentProblem.id,
        });
        EventBus.emit(GameEvents.MATH_PROBLEM_PRESENTED, this.currentProblem);
    }

    /**
     * Golden arrival: a pulsing gold frame around the board and a shimmer
     * chime. The announcement, not the reward — the coin bonus lands on the
     * win, and a miss costs nothing beyond the ordinary retry flow.
     */
    private decorateGolden(): void {
        const cx = GAME_WIDTH / 2;
        const cy = GAME_HEIGHT / 2 + 40;
        const frame = this.add.graphics().setDepth(415).setScrollFactor(0);
        frame.lineStyle(5, 0xffd700, 1);
        frame.strokeRoundedRect(cx - 270, cy - 150, 540, 300, 20);
        this.tweens.add({
            targets: frame,
            alpha: { from: 1, to: 0.45 },
            duration: 650,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
        AudioManager.getInstance().playSFX('golden');
    }

    private drawProgressPips(): void {
        const learner = LearnerStateManager.getInstance();
        const target = learner.getPromotionWinTarget();
        const wins = Math.min(target, learner.getWinsAtCurrentStep(this.currentProblem.domain));
        const tm = ThemeManager.getInstance();

        const pipRadius = 7;
        const pipSpacing = 24;
        const rowWidth = (target - 1) * pipSpacing;
        // Top-right corner inside the board (board is 520x280 centred at H/2+40).
        const startX = GAME_WIDTH / 2 + 260 - 28 - rowWidth;
        const y = GAME_HEIGHT / 2 + 40 - 140 + 20;

        const pips = this.add.graphics().setDepth(420).setScrollFactor(0);
        for (let i = 0; i < target; i++) {
            const x = startX + i * pipSpacing;
            if (i < wins) {
                pips.fillStyle(tm.getColorNum('accent'), 1);
                pips.fillCircle(x, y, pipRadius);
            } else {
                pips.lineStyle(2, tm.getColorNum('accent'), 0.7);
                pips.strokeCircle(x, y, pipRadius);
            }
        }
    }

    private buildNPCHeader(
        npcName?: string,
        greeting?: string,
        currentProblemIndex?: number,
        problemCount?: number,
    ): void {
        const tm = ThemeManager.getInstance();
        const cx = GAME_WIDTH / 2;
        const headerY = GAME_HEIGHT / 2 - 152;

        this.headerContainer = this.add.container(cx, headerY).setDepth(410).setScrollFactor(0);

        if (!npcName) return; // No NPC info, skip header

        // NPC name in accent color
        const nameText = this.add.text(0, 0, npcName, {
            fontSize: '24px',
            fontFamily: 'monospace',
            color: tm.getColor('accent'),
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5, 0.5);
        this.headerContainer.add(nameText);

        let maxTextWidth = nameText.width;
        let headerHeight = 34;

        // Greeting text in quotes
        if (greeting) {
            const greetText = this.add.text(0, 32, `"${greeting}"`, {
                fontSize: '20px',
                fontFamily: 'monospace',
                color: tm.getColor('textColor'),
                stroke: '#000000',
                strokeThickness: 2,
            }).setOrigin(0.5, 0.5).setAlpha(0.9);
            this.headerContainer.add(greetText);
            maxTextWidth = Math.max(maxTextWidth, greetText.width);
            headerHeight = 66;
        }

        if (problemCount && problemCount > 1 && currentProblemIndex) {
            const progressY = greeting ? 62 : 32;
            const progressText = this.add.text(0, progressY, TextManager.getInstance().t('math.progress', currentProblemIndex, problemCount), {
                fontSize: '16px',
                fontFamily: 'monospace',
                color: tm.getColor('textColor'),
                stroke: '#000000',
                strokeThickness: 2,
            }).setOrigin(0.5, 0.5).setAlpha(0.95);
            this.headerContainer.add(progressText);
            maxTextWidth = Math.max(maxTextWidth, progressText.width);
            headerHeight = greeting ? 92 : 60;
        }

        const headerBackdrop = this.add.rectangle(
            0,
            greeting
                ? (problemCount && problemCount > 1 && currentProblemIndex ? 29 : 16)
                : (problemCount && problemCount > 1 && currentProblemIndex ? 13 : 0),
            maxTextWidth + 36,
            headerHeight,
            0x000000,
            0.28,
        ).setOrigin(0.5, 0.5);
        this.headerContainer.addAt(headerBackdrop, 0);

        // Animate header in
        DopamineFX.elasticEntrance(this, this.headerContainer, 350, 50);
    }

    private onAnswerSelected = (result: {
        problemId: string;
        selectedAnswer: number;
        isCorrect: boolean;
    }): void => {
        // Time-to-first-answer, captured at the tap so the celebration and
        // teaching delays below never inflate the telemetry.
        if (this.firstResponseMs === 0) {
            this.firstResponseMs = Date.now() - this.presentedAt;
        }

        EventBus.emit(GameEvents.MATH_ANSWER_SUBMITTED, result);

        if (result.isCorrect) {
            const firstAttempt = this.wrongAttempts === 0;
            // Golden wins multiply the coin reward (bigger for first-try);
            // multipliers live in the shared tuning JSON.
            const golden = mathTuning().golden;
            const reward = this.isGolden
                ? Math.round(this.coinsReward * (firstAttempt ? golden.firstTryCoinMultiplier : golden.retryCoinMultiplier))
                : this.coinsReward;
            // Celebration with longer delay for dopamine absorption (1.5s for 6-year-olds)
            this.time.delayedCall(1500, () => {
                EventBus.emit(GameEvents.MATH_CHALLENGE_COMPLETE, {
                    problemId: result.problemId,
                    correct: true,
                    firstAttempt,
                    reward,
                    hintsUsed: this.currentProblem.hint && this.wrongAttempts > 0 ? 1 : 0,
                    responseMs: this.firstResponseMs,
                    wrongAttempts: this.wrongAttempts,
                    freebie: this.isFreebie,
                    golden: this.isGolden,
                });
                this.closeMathChallenge();
            });
        } else {
            this.wrongAttempts++;
            if (this.wrongAttempts >= 2) {
                // Second miss: teach before dismissing — show the correct
                // answer with its explanation, and give time to absorb it.
                this.mathBoard.revealAnswer();
                this.time.delayedCall(3000, () => {
                    EventBus.emit(GameEvents.MATH_CHALLENGE_COMPLETE, {
                        problemId: result.problemId,
                        correct: false,
                        firstAttempt: false,
                        reward: 0,
                        hintsUsed: this.currentProblem.hint && this.wrongAttempts > 0 ? 1 : 0,
                        responseMs: this.firstResponseMs,
                        wrongAttempts: this.wrongAttempts,
                        freebie: this.isFreebie,
                        golden: this.isGolden,
                    });
                    this.closeMathChallenge();
                });
            }
            // First wrong answer: MathBoard handles retry internally (re-enables after 600ms)
        }
    };

    private closeMathChallenge(): void {
        EventBus.off('math-answer-selected', this.onAnswerSelected, this);

        // Dismiss both header and board, then clean up
        if (this.headerContainer) {
            DopamineFX.elasticExit(this, this.headerContainer, 200);
        }

        if (this.mathBoard) {
            this.mathBoard.dismiss(() => {
                this.cleanup();
            });
        } else {
            this.cleanup();
        }
    }

    private cleanup(): void {
        // Fade out dim
        this.tweens.add({
            targets: this.dimOverlay,
            fillAlpha: 0,
            duration: 150,
            onComplete: () => {
                // Resume game scene
                this.scene.setVisible(true, SCENES.HUD);
                this.scene.resume(SCENES.GAME);
                // Stop this overlay scene
                this.scene.stop(SCENES.MATH_CHALLENGE);
            },
        });
    }

    shutdown(): void {
        EventBus.off('math-answer-selected', this.onAnswerSelected, this);
        this.mathBoard?.destroy();
    }
}
