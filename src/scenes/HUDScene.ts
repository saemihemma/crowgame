import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT } from '../utils/Constants';
import { HealthBar } from '../ui/components/HealthBar';
import { CoinCounter } from '../ui/components/CoinCounter';
import { AbilitySlots } from '../ui/components/AbilitySlots';
import { OwlRing } from '../ui/components/OwlRing';
import { TouchControls } from '../ui/TouchControls';
import { SaveManager } from '../systems/SaveManager';
import type { InputManager } from '../systems/InputManager';

/**
 * Parallel scene that renders the HUD layer on top of GameScene.
 * Contains: HealthBar, CoinCounter, OwlCounter, and TouchControls.
 * XP bar is hidden — owls saved is more motivating for kids.
 */
/**
 * Parallel scene that renders the HUD layer on top of GameScene.
 *
 * Three pods, per brand/BRAND_SYSTEM.md §8.2: life on the left, the owl ring on
 * the right, and a coin chip that fades when nothing is happening. Top-centre is
 * deliberately empty — it is what makes a streak toast read as an event.
 *
 * The previous layout stacked health, coins and owls as three left-aligned rows
 * of equal weight at 16px, which put the entire goal of the game (owls saved) at
 * the same visual authority as a debug readout, and inside the 24px safe area.
 */
export class HUDScene extends Phaser.Scene {
    /** Safe area. 24 on desktop; touch builds want 32 to clear gesture bars. */
    private static readonly MARGIN = 24;

    private healthBar!: HealthBar;
    private coinCounter!: CoinCounter;
    private abilitySlots!: AbilitySlots;
    private owlRing!: OwlRing;
    private touchControls!: TouchControls;

    constructor() {
        super({ key: SCENES.HUD });
    }

    create(data: { inputManager?: InputManager }): void {
        this.events.once('shutdown', this.shutdown, this);

        const m = HUDScene.MARGIN;
        const save = SaveManager.getInstance().getData();

        // LEFT POD — life.
        this.healthBar = new HealthBar(this, m, m);

        // Coin chip, under the hearts. Idle-fades on its own.
        this.coinCounter = new CoinCounter(this, m, m + 48);
        this.coinCounter.setCount(save.coins);

        // RIGHT POD — the owl ring. The goal anchor, and the biggest thing on
        // the HUD. Centred on its own radius so the ring's right edge lands on
        // the safe-area margin.
        this.owlRing = new OwlRing(this, GAME_WIDTH - m - 28, m + 28);
        this.owlRing.setSessionTotal(save.owlsSaved);

        // Abilities move to the bottom right: the top right now belongs to the
        // ring, and two 64px slots there would compete with it.
        this.abilitySlots = new AbilitySlots(this, GAME_WIDTH - m - 140, GAME_HEIGHT - m - 64);

        this.touchControls = new TouchControls(this, (state) => {
            if (data.inputManager) {
                data.inputManager.setTouchState(state);
            }
        });
    }

    getTouchControls(): TouchControls { return this.touchControls; }

    shutdown(): void {
        this.healthBar?.destroy();
        this.coinCounter?.destroy();
        this.abilitySlots?.destroy();
        this.owlRing?.destroy();
        this.touchControls?.destroy();
    }
}
