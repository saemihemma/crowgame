import type { Ability, AbilityContext } from './Ability';
import type { InputState } from '../../utils/Types';
import { EventBus, GameEvents } from '../../utils/EventBus';

export class AbilityManager {
    private abilities: Map<string, Ability> = new Map();

    grant(ability: Ability): void {
        if (this.abilities.has(ability.id)) return;
        this.abilities.set(ability.id, ability);
        ability.onGrant();
        EventBus.emit(GameEvents.ABILITY_GRANTED, ability.id);
    }

    revoke(abilityId: string): void {
        const ability = this.abilities.get(abilityId);
        if (ability) {
            ability.onRevoke();
            this.abilities.delete(abilityId);
            EventBus.emit(GameEvents.ABILITY_REVOKED, abilityId);
        }
    }

    has(abilityId: string): boolean {
        return this.abilities.has(abilityId);
    }

    update(body: Phaser.Physics.Arcade.Body, input: InputState, delta: number, context: AbilityContext): void {
        for (const ability of this.abilities.values()) {
            ability.onUpdate(body, input, delta, context);
        }
    }

    clear(): void {
        for (const ability of this.abilities.values()) {
            ability.onRevoke();
        }
        this.abilities.clear();
    }
}
