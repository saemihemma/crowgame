import type { NPCDefinition, NPCRegistry } from '../utils/Types';
import { BaseNPC } from '../entities/npc/BaseNPC';
import { InteractableComponent } from '../entities/npc/components/InteractableComponent';
import { DialogComponent, type DialogComponentConfig } from '../entities/npc/components/DialogComponent';
import { MathChallengeComponent, type MathChallengeComponentConfig } from '../entities/npc/components/MathChallengeComponent';

/**
 * Factory that reads npc_registry.json and creates BaseNPC instances
 * with the correct components based on each NPCDefinition.
 */
export class NPCFactory {
    private static instance: NPCFactory;
    private definitions: Map<string, NPCDefinition> = new Map();

    private constructor() {}

    static getInstance(): NPCFactory {
        if (!NPCFactory.instance) {
            NPCFactory.instance = new NPCFactory();
        }
        return NPCFactory.instance;
    }

    /** Load NPC definitions from cached registry data */
    init(registryData: NPCRegistry): void {
        this.definitions.clear();
        for (const npc of registryData.npcs) {
            this.definitions.set(npc.id, npc);
        }
    }

    /** Get a definition by NPC id */
    getDefinition(npcId: string): NPCDefinition | undefined {
        return this.definitions.get(npcId);
    }

    /**
     * Create an NPC instance at the given position.
     * Returns null if the NPC id is not found in the registry.
     */
    create(scene: Phaser.Scene, x: number, y: number, npcId: string): BaseNPC | null {
        const definition = this.definitions.get(npcId);
        if (!definition) {
            console.warn(`NPCFactory: unknown NPC id "${npcId}"`);
            return null;
        }

        const npc = new BaseNPC(scene, x, y, definition);

        // Add components based on definition
        for (const compConfig of definition.components) {
            switch (compConfig.type) {
                case 'interactable':
                    npc.addComponent(new InteractableComponent());
                    break;

                case 'dialog':
                    npc.addComponent(new DialogComponent(compConfig as unknown as DialogComponentConfig));
                    break;

                case 'math_challenge':
                    npc.addComponent(new MathChallengeComponent(compConfig as unknown as MathChallengeComponentConfig));
                    break;

                default:
                    console.warn(`NPCFactory: unknown component type "${compConfig.type}" for NPC "${npcId}"`);
                    break;
            }
        }

        return npc;
    }
}
