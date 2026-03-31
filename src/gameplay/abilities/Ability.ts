import type { InputState } from '../../utils/Types';

/**
 * Base interface for all player abilities.
 * Abilities modify player behavior when active.
 */
export interface Ability {
    readonly id: string;

    /** Called once when the ability is granted */
    onGrant(): void;

    /** Called once when the ability is revoked */
    onRevoke(): void;

    /** Called every frame while the ability is active */
    onUpdate(
        body: Phaser.Physics.Arcade.Body,
        input: InputState,
        delta: number,
        context: AbilityContext,
    ): void;
}

export interface AbilityContext {
    isOnFloor: boolean;
    velocity: Phaser.Math.Vector2;
    jumpVelocity: number;
}
