import { ThemeManager, THEME_CHANGED } from '../theme/ThemeManager';
import { EventBus, GameEvents } from '../../utils/EventBus';

/**
 * Row of ability icons in the HUD.
 * Grant animation: icon flies in, lands in slot with glow.
 */
export class AbilitySlots {
    private scene: Phaser.Scene;
    private container: Phaser.GameObjects.Container;
    private slots: Map<string, Phaser.GameObjects.Image> = new Map();
    private slotIndex = 0;

    constructor(scene: Phaser.Scene, x: number, y: number) {
        this.scene = scene;
        this.container = scene.add.container(x, y).setScrollFactor(0).setDepth(200);

        EventBus.on(GameEvents.ABILITY_GRANTED, this.onAbilityGranted, this);
        EventBus.on(GameEvents.ABILITY_REVOKED, this.onAbilityRevoked, this);
        EventBus.on(THEME_CHANGED, this.onThemeChanged, this);
    }

    private onAbilityGranted = (abilityId: string): void => {
        if (this.slots.has(abilityId)) return;

        const tm = ThemeManager.getInstance();
        const key = `ability_icon_${abilityId}`;

        // Create placeholder icon if texture doesn't exist
        if (!this.scene.textures.exists(key)) {
            const gfx = this.scene.add.graphics();
            const accent = tm.getColorNum('accent');
            gfx.fillStyle(0x333344, 1);
            gfx.fillRoundedRect(0, 0, 40, 40, 6);
            gfx.fillStyle(accent, 1);
            gfx.fillRoundedRect(6, 6, 28, 28, 4);
            gfx.generateTexture(key, 40, 40);
            gfx.destroy();
        }

        const slotX = this.slotIndex * 48;
        const icon = this.scene.add.image(slotX, 0, key).setOrigin(0, 0).setAlpha(0);
        this.container.add(icon);
        this.slots.set(abilityId, icon);
        this.slotIndex++;

        // Fly-in animation from center of screen
        const centerX = this.scene.cameras.main.width / 2 - this.container.x;
        const centerY = this.scene.cameras.main.height / 2 - this.container.y;
        icon.setPosition(centerX, centerY);
        icon.setAlpha(1);
        icon.setScale(2);

        this.scene.tweens.add({
            targets: icon,
            x: slotX,
            y: 0,
            scaleX: 1,
            scaleY: 1,
            duration: 500,
            ease: 'Back.easeOut',
            onComplete: () => {
                // Landing glow pulse
                this.scene.tweens.add({
                    targets: icon,
                    scaleX: 1.3,
                    scaleY: 1.3,
                    duration: 150,
                    yoyo: true,
                    ease: 'Sine.easeInOut',
                });
            },
        });
    };

    private onAbilityRevoked = (abilityId: string): void => {
        const icon = this.slots.get(abilityId);
        if (!icon) return;

        this.scene.tweens.add({
            targets: icon,
            alpha: 0,
            scaleX: 0,
            scaleY: 0,
            duration: 300,
            onComplete: () => {
                icon.destroy();
                this.slots.delete(abilityId);
            },
        });
    };

    private onThemeChanged = (): void => {
        // Ability icons are not theme-specific in this implementation
        // but we could rebuild them if needed
    };

    destroy(): void {
        EventBus.off(GameEvents.ABILITY_GRANTED, this.onAbilityGranted, this);
        EventBus.off(GameEvents.ABILITY_REVOKED, this.onAbilityRevoked, this);
        EventBus.off(THEME_CHANGED, this.onThemeChanged, this);
        this.container.destroy(true);
    }
}
