import type { NPCDefinition } from '../../utils/Types';
import { applyGroundingVisualSink } from '../../utils/applyGroundingVisualSink';

/**
 * Interface that all NPC components must implement.
 */
export interface NPCComponent {
    readonly type: string;

    /** Called once when the NPC is created */
    init(npc: BaseNPC): void;

    /** Called every frame */
    update(delta: number): void;

    /** Called when the player interacts with this NPC */
    onInteract(): void;

    /** Cleanup */
    destroy(): void;
}

/**
 * Composition-based NPC entity.
 * Has a sprite, an interaction zone, and a list of components
 * that define its behavior (dialog, math challenge, etc.).
 */
export class BaseNPC {
    public sprite: Phaser.Physics.Arcade.Sprite;
    public definition: NPCDefinition;
    public scene: Phaser.Scene;

    private components: NPCComponent[] = [];
    private interactZone: Phaser.GameObjects.Zone;
    private promptText: Phaser.GameObjects.Text | null = null;
    private playerInRange = false;
    private interacting = false;
    private cooldownUntil = 0; // timestamp — prevents immediate re-trigger

    constructor(
        scene: Phaser.Scene,
        x: number,
        y: number,
        definition: NPCDefinition,
    ) {
        this.scene = scene;
        this.definition = definition;

        // Create physics sprite (immovable so the player bumps into the NPC)
        const textureKey = definition.spriteKey || 'owl';
        this.sprite = scene.physics.add.sprite(x, y, textureKey);
        this.sprite.setOrigin(0.5, 1);
        this.sprite.setImmovable(true);
        (this.sprite.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
        this.sprite.setData('npc', this);

        // Runtime NPC assets should already be exported at gameplay size.
        const body = this.sprite.body as Phaser.Physics.Arcade.Body;
        body.setSize(this.sprite.displayWidth, this.sprite.displayHeight);
        applyGroundingVisualSink(this.sprite, 4);

        // Play idle animation if available
        const idleKey = `${textureKey}_idle`;
        // Check both texture AND animation exist before playing
        if (scene.textures.exists(textureKey) && scene.anims.exists(idleKey)) {
            this.sprite.anims.play(idleKey);
        } else {
            // No animation - static image display (expected for single-image NPCs)
        }

        // Interaction zone (slightly larger than sprite for easy approach)
        this.interactZone = scene.add.zone(x, y - 32, 96, 96);
        scene.physics.add.existing(this.interactZone, true);
    }

    /** Get the physics zone for overlap detection */
    getInteractZone(): Phaser.GameObjects.Zone {
        return this.interactZone;
    }

    /** Add a component to this NPC */
    addComponent(component: NPCComponent): void {
        this.components.push(component);
        component.init(this);
    }

    /** Get a component by type */
    getComponent<T extends NPCComponent>(type: string): T | undefined {
        return this.components.find(c => c.type === type) as T | undefined;
    }

    /** Called when player enters interaction range */
    setPlayerInRange(inRange: boolean): void {
        if (inRange === this.playerInRange) return;
        this.playerInRange = inRange;

        if (inRange && !this.interacting) {
            this.showPrompt();
        } else {
            this.hidePrompt();
        }
    }

    /** Called to start interaction (auto-triggered on collision or manual) */
    interact(): void {
        if (this.interacting) return;
        if (Date.now() < this.cooldownUntil) return; // Still in cooldown
        this.playerInRange = true;
        this.interacting = true;
        this.hidePrompt();

        // If a math_challenge component exists, it drives the whole flow
        // (skipping the dialog component's standalone greeting)
        const mathComp = this.components.find(c => c.type === 'math_challenge');
        if (mathComp) {
            mathComp.onInteract();
            return;
        }

        // Otherwise, notify all components normally
        for (const comp of this.components) {
            comp.onInteract();
        }
    }

    /** Called when interaction is complete (e.g., dialog ended, math answered) */
    endInteraction(): void {
        this.interacting = false;
        // 2-second cooldown so auto-trigger doesn't re-fire while player is still in range
        this.cooldownUntil = Date.now() + 2000;
        if (this.playerInRange) {
            this.showPrompt();
        }
    }

    /** Fly-away animation: NPC flies up and is removed from the scene */
    flyAway(): void {
        this.hidePrompt();
        this.interacting = false;
        // Disable interaction zone immediately
        this.interactZone.destroy();

        // Fly up and fade out
        this.scene.tweens.add({
            targets: this.sprite,
            y: this.sprite.y - 400,
            alpha: 0,
            duration: 800,
            ease: 'Power2',
            onComplete: () => {
                this.destroy();
            },
        });
    }

    isInteracting(): boolean {
        return this.interacting;
    }

    private showPrompt(): void {
        if (this.promptText) return;

        // Show NPC name above their head as a hint
        this.promptText = this.scene.add.text(
            this.sprite.x,
            this.sprite.y - this.definition.frameHeight - 16,
            this.definition.name || '...',
            {
                fontSize: '16px',
                fontFamily: 'monospace',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 3,
                align: 'center',
            },
        ).setOrigin(0.5, 1).setDepth(100);

        // Bobbing animation
        this.scene.tweens.add({
            targets: this.promptText,
            y: this.promptText.y - 6,
            duration: 600,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
    }

    private hidePrompt(): void {
        if (this.promptText) {
            this.promptText.destroy();
            this.promptText = null;
        }
    }

    update(delta: number): void {
        for (const comp of this.components) {
            comp.update(delta);
        }
    }

    destroy(): void {
        for (const comp of this.components) {
            comp.destroy();
        }
        this.components = [];
        this.hidePrompt();
        this.interactZone.destroy();
        this.sprite.destroy();
    }
}
