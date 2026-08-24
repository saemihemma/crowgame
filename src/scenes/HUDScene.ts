import Phaser from 'phaser';
import { SCENES, GAME_WIDTH } from '../utils/Constants';
import { HealthBar } from '../ui/components/HealthBar';
import { CoinCounter } from '../ui/components/CoinCounter';
import { AbilitySlots } from '../ui/components/AbilitySlots';
import { OwlCounter } from '../ui/components/OwlCounter';
import { TouchControls } from '../ui/TouchControls';
import { SaveManager } from '../systems/SaveManager';
import type { InputManager } from '../systems/InputManager';

/**
 * Parallel scene that renders the HUD layer on top of GameScene.
 * Contains: HealthBar, CoinCounter, OwlCounter, and TouchControls.
 * XP bar is hidden — owls saved is more motivating for kids.
 */
export class HUDScene extends Phaser.Scene {
    private healthBar!: HealthBar;
    private coinCounter!: CoinCounter;
    private abilitySlots!: AbilitySlots;
    private owlCounter!: OwlCounter;
    private touchControls!: TouchControls;

    constructor() {
        super({ key: SCENES.HUD });
    }

    create(data: { inputManager?: InputManager }): void {
        this.events.once('shutdown', this.shutdown, this);

        // Health bar: top-left
        this.healthBar = new HealthBar(this, 16, 16);

        // Coin counter: below health
        this.coinCounter = new CoinCounter(this, 16, 56);

        // Owl counter: below coins (where XP bar used to be)
        this.owlCounter = new OwlCounter(this, 16, 88);

        // Set initial owl count from save data
        const save = SaveManager.getInstance().getData();
        this.coinCounter.setCount(save.coins);
        this.owlCounter.setCount(save.owlsSaved);

        // Ability slots: top-right area
        this.abilitySlots = new AbilitySlots(this, GAME_WIDTH - 160, 16);

        // Touch controls: wire to InputManager if provided
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
        this.owlCounter?.destroy();
        this.touchControls?.destroy();
    }
}
