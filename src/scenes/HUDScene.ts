import Phaser from 'phaser';
import { SCENES, GAME_WIDTH } from '../utils/Constants';
import { HealthBar } from '../ui/components/HealthBar';
import { CoinCounter } from '../ui/components/CoinCounter';
import { AbilitySlots } from '../ui/components/AbilitySlots';
import { OwlCounter } from '../ui/components/OwlCounter';
import { TouchControls } from '../ui/TouchControls';
import { SaveManager } from '../systems/SaveManager';
import { TextManager } from '../systems/TextManager';
import { EventBus, GameEvents } from '../utils/EventBus';
import { DopamineFX } from '../ui/fx/DopamineFX';
import type { InputManager } from '../systems/InputManager';
import type { MathDomain } from '../utils/Types';

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
    // Curriculum step-ups are queued and shown when the HUD is next visible,
    // because they fire while the math overlay still owns (and hides) the HUD.
    private pendingStepUps: MathDomain[] = [];
    private stepUpBannerActive = false;

    constructor() {
        super({ key: SCENES.HUD });
    }

    create(data: { inputManager?: InputManager }): void {
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

        EventBus.on(GameEvents.CURRICULUM_STEP_UP, this.onCurriculumStepUp, this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            EventBus.off(GameEvents.CURRICULUM_STEP_UP, this.onCurriculumStepUp, this);
        });
    }

    update(): void {
        if (
            this.pendingStepUps.length > 0 &&
            !this.stepUpBannerActive &&
            this.scene.isVisible(SCENES.HUD)
        ) {
            this.showStepUpBanner(this.pendingStepUps.shift()!);
        }
    }

    private onCurriculumStepUp = (data: { domain: MathDomain; step: number }): void => {
        this.pendingStepUps.push(data.domain);
    };

    /** Celebrate a difficulty step-up: only ever up-moves, never demotions. */
    private showStepUpBanner(domain: MathDomain): void {
        this.stepUpBannerActive = true;

        const tt = TextManager.getInstance();
        const label = tt.t('math.step_up', tt.t(`domain.${domain}`));
        const cx = GAME_WIDTH / 2;
        const cy = 120;

        DopamineFX.celebrationBurst(this, cx, cy);

        const banner = this.add.text(cx, cy, label, {
            fontSize: '36px',
            fontFamily: 'monospace',
            color: '#ffd700',
            stroke: '#000000',
            strokeThickness: 8,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(510).setScale(0);

        this.tweens.add({
            targets: banner,
            scaleX: 1,
            scaleY: 1,
            duration: 300,
            ease: 'Back.easeOut',
            onComplete: () => {
                this.time.delayedCall(1600, () => {
                    this.tweens.add({
                        targets: banner,
                        alpha: 0,
                        y: cy - 50,
                        duration: 400,
                        onComplete: () => {
                            banner.destroy();
                            this.stepUpBannerActive = false;
                        },
                    });
                });
            },
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
