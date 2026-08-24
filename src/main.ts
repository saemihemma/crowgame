import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { LoginScene } from './scenes/LoginScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { LevelSelectScene } from './scenes/LevelSelectScene';
import { GameScene } from './scenes/GameScene';
import { HUDScene } from './scenes/HUDScene';
import { MathChallengeScene } from './scenes/MathChallengeScene';
import { PauseScene } from './scenes/PauseScene';
import { GAME_WIDTH, GAME_HEIGHT, DEFAULT_GRAVITY, SCENES } from './utils/Constants';
import { EventBus, GameEvents } from './utils/EventBus';
import { TextManager } from './systems/TextManager';

const prefersDesktopIntegerScaling = (): boolean =>
    window.matchMedia('(hover: hover) and (pointer: fine)').matches;

const resolveParentSize = (viewportWidth: number, viewportHeight: number): { width: number; height: number } => {
    const canUseIntegerDesktopScale =
        prefersDesktopIntegerScaling() &&
        viewportWidth >= GAME_WIDTH &&
        viewportHeight >= GAME_HEIGHT;

    if (!canUseIntegerDesktopScale) {
        return { width: viewportWidth, height: viewportHeight };
    }

    const integerScale = Math.max(1, Math.floor(Math.min(
        viewportWidth / GAME_WIDTH,
        viewportHeight / GAME_HEIGHT,
    )));

    return {
        width: GAME_WIDTH * integerScale,
        height: GAME_HEIGHT * integerScale,
    };
};

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    parent: 'game-container',
    pixelArt: true,
    roundPixels: true,
    render: {
        antialias: false,
    },
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { x: 0, y: DEFAULT_GRAVITY },
            debug: false,
        },
    },
    scene: [
        BootScene,
        LoginScene,
        MainMenuScene,
        LevelSelectScene,
        GameScene,
        HUDScene,
        MathChallengeScene,
        PauseScene,
    ],
    input: {
        activePointers: 3,
    },
    dom: {
        createContainer: true,
    },
    backgroundColor: '#87CEEB',
};

const game = new Phaser.Game(config);

const gameContainer = document.getElementById('game-container');

const applyDisplayPolicy = (): void => {
    if (!gameContainer) {
        return;
    }

    const { width, height } = resolveParentSize(window.innerWidth, window.innerHeight);

    gameContainer.style.width = `${width}px`;
    gameContainer.style.height = `${height}px`;
    gameContainer.dataset.scaleMode = prefersDesktopIntegerScaling() ? 'desktop' : 'touch';

    game.scale.setParentSize(width, height);
    game.scale.refresh();
};

window.addEventListener('resize', applyDisplayPolicy);
window.addEventListener('orientationchange', applyDisplayPolicy);
window.requestAnimationFrame(applyDisplayPolicy);

if (import.meta.env.DEV) {
    const debugWindow = window as Window & {
        __crowGame?: Phaser.Game;
        __crowApplyDisplayPolicy?: () => void;
        __crowMathSmoke?: {
            startLevel: (levelKey?: string) => boolean;
            triggerFirstOwlInteraction: () => boolean;
            getLocale: () => string;
            getMathState: () => {
                prompt: string;
                renderedPrompt: string | null;
                locale: string;
                problemId: string;
                correctAnswer: number;
                options: number[];
                wrongAttempts: number;
                optionCenters: Array<{ value: number; x: number; y: number }>;
                canvasRect: { left: number; top: number; width: number; height: number } | null;
            } | null;
            getLastCompletion: () => Record<string, unknown> | null;
            getCompletionHistory: () => Array<Record<string, unknown>>;
            clearLastCompletion: () => void;
            clearCompletions: () => void;
        };
    };
    debugWindow.__crowGame = game;
    debugWindow.__crowApplyDisplayPolicy = applyDisplayPolicy;

    let lastMathCompletion: Record<string, unknown> | null = null;
    const mathCompletionHistory: Array<Record<string, unknown>> = [];
    EventBus.on(GameEvents.MATH_CHALLENGE_COMPLETE, (payload: unknown) => {
        if (payload && typeof payload === 'object') {
            const completion = { ...(payload as Record<string, unknown>) };
            lastMathCompletion = completion;
            mathCompletionHistory.push(completion);
        }
    });

    const getScene = <T extends Phaser.Scene>(key: string): T | null => {
        if (!game.scene.keys[key]) {
            return null;
        }
        return game.scene.getScene(key) as T;
    };

    const stopSceneIfActive = (key: string): void => {
        if (game.scene.isActive(key)) {
            game.scene.stop(key);
        }
    };

    debugWindow.__crowMathSmoke = {
        // The active locale, readable before a problem is on screen.
        getLocale: () => TextManager.getInstance().getLocale(),
        startLevel: (levelKey = 'level_01') => {
            stopSceneIfActive(SCENES.MATH_CHALLENGE);
            stopSceneIfActive(SCENES.PAUSE);
            stopSceneIfActive(SCENES.HUD);
            stopSceneIfActive(SCENES.GAME);
            stopSceneIfActive(SCENES.MAIN_MENU);
            stopSceneIfActive(SCENES.LEVEL_SELECT);
            stopSceneIfActive(SCENES.LOGIN);

            game.scene.start(SCENES.GAME, { levelKey });
            return true;
        },
        triggerFirstOwlInteraction: () => {
            const scene = getScene<GameScene>(SCENES.GAME) as unknown as { activeNPCs?: Array<{ interact: () => void }> } | null;
            const firstNPC = scene?.activeNPCs?.[0];
            if (!firstNPC) {
                return false;
            }
            firstNPC.interact();
            return true;
        },
        getMathState: () => {
            if (!game.scene.isActive(SCENES.MATH_CHALLENGE)) {
                return null;
            }

            const scene = getScene<MathChallengeScene>(SCENES.MATH_CHALLENGE) as unknown as ({
                mathBoard?: {
                    container?: Phaser.GameObjects.Container;
                    optionButtons?: Phaser.GameObjects.Container[];
                    getRenderedQuestion?: () => string;
                };
                currentProblem?: {
                    id: string;
                    prompt: { text: string };
                    answer: { correct: number; options?: number[] };
                };
                wrongAttempts?: number;
            }) | null;

            if (!scene?.mathBoard?.container || !scene.currentProblem) {
                return null;
            }

            const optionCenters = (scene.mathBoard.optionButtons ?? [])
                .map((button: Phaser.GameObjects.Container) => {
                    const label = button.getAt(1) as Phaser.GameObjects.Text | undefined;
                    const value = Number(label?.text ?? '');
                    return {
                        value,
                        x: scene.mathBoard!.container!.x + button.x,
                        y: scene.mathBoard!.container!.y + button.y,
                    };
                })
                .filter((entry: { value: number }) => Number.isFinite(entry.value));

            const canvasRect = game.canvas
                ? {
                    left: game.canvas.getBoundingClientRect().left,
                    top: game.canvas.getBoundingClientRect().top,
                    width: game.canvas.getBoundingClientRect().width,
                    height: game.canvas.getBoundingClientRect().height,
                }
                : null;

            return {
                // The canonical English, which the smoke's independent arithmetic
                // check parses operands out of. Never localised.
                prompt: scene.currentProblem.prompt.text,
                // What is actually on the board right now, in the active locale.
                // Without this a harness cannot tell a localised build from an
                // English one -- the canvas is WebGL, so there is no text to read
                // back, and the smoke passed identically either way.
                renderedPrompt: scene.mathBoard?.getRenderedQuestion?.() ?? null,
                locale: TextManager.getInstance().getLocale(),
                problemId: scene.currentProblem.id,
                correctAnswer: scene.currentProblem.answer.correct,
                options: [...(scene.currentProblem.answer.options ?? [])],
                wrongAttempts: scene.wrongAttempts ?? 0,
                optionCenters,
                canvasRect,
            };
        },
        getLastCompletion: () => lastMathCompletion ? { ...lastMathCompletion } : null,
        getCompletionHistory: () => mathCompletionHistory.map(completion => ({ ...completion })),
        clearLastCompletion: () => {
            lastMathCompletion = null;
        },
        clearCompletions: () => {
            lastMathCompletion = null;
            mathCompletionHistory.length = 0;
        },
    };
}
