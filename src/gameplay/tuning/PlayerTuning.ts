import { PlayerTuningData, TuningModifierData } from '../../utils/Types';

export class PlayerTuning {
    private baseValues: PlayerTuningData;
    private modifiers: TuningModifierData[] = [];

    constructor(data: PlayerTuningData) {
        this.baseValues = { ...data };
    }

    /** Get the effective value of a tuning property (base + all modifiers applied) */
    get(property: keyof PlayerTuningData): number {
        let value = this.baseValues[property];

        // Apply additive modifiers first, then multiplicative
        for (const mod of this.modifiers) {
            if (mod.property === property && mod.operation === 'add') {
                value += mod.value;
            }
        }
        for (const mod of this.modifiers) {
            if (mod.property === property && mod.operation === 'multiply') {
                value *= mod.value;
            }
        }

        return value;
    }

    /** Shortcut getters for common properties */
    get accel(): number { return this.get('accel'); }
    get drag(): number { return this.get('drag'); }
    get maxSpeed(): number { return this.get('maxSpeed'); }
    get jumpVelocity(): number { return this.get('jumpVelocity'); }
    get coyoteMs(): number { return this.get('coyoteMs'); }
    get jumpBufferMs(): number { return this.get('jumpBufferMs'); }
    get gravityScale(): number { return this.get('gravityScale'); }
    get terminalVelocity(): number { return this.get('terminalVelocity'); }

    addModifier(mod: TuningModifierData): void {
        this.modifiers.push(mod);
    }

    removeModifier(modId: string): void {
        this.modifiers = this.modifiers.filter(m => m.id !== modId);
    }

    hasModifier(modId: string): boolean {
        return this.modifiers.some(m => m.id === modId);
    }

    clearModifiers(): void {
        this.modifiers = [];
    }

    /** Update timed modifiers. Call each frame with delta in ms. */
    updateTimedModifiers(deltaMs: number): void {
        this.modifiers = this.modifiers.filter(mod => {
            if (mod.duration == null) return true; // permanent
            mod.duration -= deltaMs;
            return mod.duration > 0;
        });
    }
}
