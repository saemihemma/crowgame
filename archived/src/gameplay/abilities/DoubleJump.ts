import type { Ability, AbilityContext } from './Ability';
import type { InputState } from '../../utils/Types';

export class DoubleJump implements Ability {
    readonly id = 'double_jump';
    private hasDoubleJumped = false;

    onGrant(): void {
        this.hasDoubleJumped = false;
    }

    onRevoke(): void {
        this.hasDoubleJumped = false;
    }

    onUpdate(
        body: Phaser.Physics.Arcade.Body,
        input: InputState,
        _delta: number,
        context: AbilityContext,
    ): void {
        // Reset double jump when landing
        if (context.isOnFloor) {
            this.hasDoubleJumped = false;
            return;
        }

        // Perform double jump in air
        if (input.jumpJustPressed && !this.hasDoubleJumped && !context.isOnFloor) {
            body.setVelocityY(-context.jumpVelocity * 0.85); // Slightly weaker second jump
            this.hasDoubleJumped = true;
        }
    }
}
