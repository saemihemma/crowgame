import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT } from '../utils/Constants';
import { MathBoard } from '../ui/components/MathBoard';
import { EventBus, GameEvents } from '../utils/EventBus';
import { DopamineFX } from '../ui/fx/DopamineFX';
import { ThemeManager } from '../ui/theme/ThemeManager';
import { TextManager } from '../systems/TextManager';
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
    /**
     * Header baseline. Its backdrop runs from roughly -17 to +75 around this,
     * so 46 puts it at 29..121 - inside the 24px safe area and clear of the
     * board, whose top edge is at 162.
     */
    private static readonly HEADER_Y = 46;

    /** Trailing alpha byte of an 8-digit theme colour, defaulting to opaque. */
    private static parseScrimAlpha(hex: string): number {
        return hex.length >= 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
    }

    private dimOverlay!: Phaser.GameObjects.Rectangle;
    private mathBoard!: MathBoard;
    private currentProblem!: MathProblem;
    private coinsReward = 1;
    private wrongAttempts = 0;
    private presentedAt = 0;

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
    }): void {
        this.events.once('shutdown', this.shutdown, this);

        if (!data.problem) {
            console.warn('MathChallengeScene: no problem provided, closing.');
            this.closeMathChallenge();
            return;
        }

        this.currentProblem = data.problem;
        this.coinsReward = data.coinsReward ?? 1;
        this.wrongAttempts = 0;
        this.presentedAt = Date.now();

        // Pause the game scene and let the challenge own the screen.
        this.scene.pause(SCENES.GAME);
        this.scene.setVisible(false, SCENES.HUD);

        // Scrim, from the theme rather than pure black. A black wash behind warm
        // pixel art reads as a hole punched in the screen; warm near-black reads
        // as the world dimming. brand/BRAND_SYSTEM.md section 8.7.
        const scrim = ThemeManager.getInstance().getColor('scrim');
        this.dimOverlay = this.add.rectangle(
            GAME_WIDTH / 2, GAME_HEIGHT / 2,
            GAME_WIDTH, GAME_HEIGHT,
            parseInt(scrim.slice(1, 7), 16), 0,
        ).setDepth(300).setScrollFactor(0);

        this.tweens.add({
            targets: this.dimOverlay,
            fillAlpha: MathChallengeScene.parseScrimAlpha(scrim),
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

        // Listen for answer
        EventBus.on('math-answer-selected', this.onAnswerSelected, this);

        // Emit challenge start event
        EventBus.emit(GameEvents.MATH_CHALLENGE_START, {
            problemId: this.currentProblem.id,
        });
        EventBus.emit(GameEvents.MATH_PROBLEM_PRESENTED, this.currentProblem);
    }

    private buildNPCHeader(
        npcName?: string,
        greeting?: string,
        currentProblemIndex?: number,
        problemCount?: number,
    ): void {
        const tm = ThemeManager.getInstance();
        const cx = GAME_WIDTH / 2;
        // The header sits clear above the board. At the old -152 its lowest line
        // fell inside the board's top edge, so "Problem 1 of 2" read as though it
        // were printed on the frame.
        const headerY = MathChallengeScene.HEADER_Y;

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
        EventBus.emit(GameEvents.MATH_ANSWER_SUBMITTED, result);

        if (result.isCorrect) {
            const firstAttempt = this.wrongAttempts === 0;
            // Celebration with longer delay for dopamine absorption (1.5s for 6-year-olds)
            this.time.delayedCall(1500, () => {
                EventBus.emit(GameEvents.MATH_CHALLENGE_COMPLETE, {
                    problemId: result.problemId,
                    correct: true,
                    firstAttempt,
                    reward: this.coinsReward,
                    hintsUsed: this.currentProblem.hint && this.wrongAttempts > 0 ? 1 : 0,
                    responseMs: Date.now() - this.presentedAt,
                    wrongAttempts: this.wrongAttempts,
                });
                this.closeMathChallenge();
            });
        } else {
            this.wrongAttempts++;
            if (this.wrongAttempts >= 2) {
                // Second failure — dismiss the overlay
                this.time.delayedCall(800, () => {
                    EventBus.emit(GameEvents.MATH_CHALLENGE_COMPLETE, {
                        problemId: result.problemId,
                        correct: false,
                        firstAttempt: false,
                        reward: 0,
                        hintsUsed: this.currentProblem.hint && this.wrongAttempts > 0 ? 1 : 0,
                        responseMs: Date.now() - this.presentedAt,
                        wrongAttempts: this.wrongAttempts,
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
