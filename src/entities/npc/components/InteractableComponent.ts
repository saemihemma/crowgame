import type { BaseNPC, NPCComponent } from '../BaseNPC';
import { EventBus, GameEvents } from '../../../utils/EventBus';

/**
 * Makes an NPC interactable.
 * Fires NPC_INTERACT event when the player interacts.
 */
export class InteractableComponent implements NPCComponent {
    readonly type = 'interactable';
    private npc!: BaseNPC;

    init(npc: BaseNPC): void {
        this.npc = npc;
    }

    update(_delta: number): void {
        // No-op; interaction is triggered externally
    }

    onInteract(): void {
        EventBus.emit(GameEvents.NPC_INTERACT, {
            npcId: this.npc.definition.id,
            npcName: this.npc.definition.name,
        });
    }

    destroy(): void {
        // Nothing to clean up
    }
}
