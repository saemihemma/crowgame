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
    // Celebration banners (step-ups, comebacks) are queued and shown when the
    // HUD is next visible, because they fire while the math overlay still
    // owns (and hides) the HUD. Only ever good news — demotions never queue.
    private pendingBanners: string[] = [];
    private bannerActive = false;

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
        EventBus.on(GameEvents.MATH_COMEBACK, this.onMathComeback, this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            EventBus.off(GameEvents.CURRICULUM_STEP_UP, this.onCurriculumStepUp, this);
            EventBus.off(GameEvents.MATH_COMEBACK, this.onMathComeback, this);
        });
    }

    update(): void {
        if (
            this.pendingBanners.length > 0 &&
            !this.bannerActive &&
            this.scene.isVisible(SCENES.HUD)
        ) {
            this.showBanner(this.pendingBanners.shift()!);
        }
    }

    private onCurriculumStepUp = (data: { domain: MathDomain; step: number }): void => {
        const tt = TextManager.getInstance();
        this.pendingBanners.push(tt.t('math.step_up', tt.t(`domain.${data.domain}`)));
    };

    /** The redemption arc: a skill missed earlier was just beaten on its
     *  scheduled return. Celebrated harder than an ordinary win. */
    private onMathComeback = (): void => {
        this.pendingBanners.push(TextManager.getInstance().t('math.comeback'));
    };

    /** Celebrate good news only: step-ups and comebacks, never demotions. */
    private showBanner(label: string): void {
        this.bannerActive = true;

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
                            this.bannerActive = false;
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
