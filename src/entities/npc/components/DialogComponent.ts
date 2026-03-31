import type { BaseNPC, NPCComponent } from '../BaseNPC';
import { DialogBox, type DialogLine } from '../../../ui/DialogBox';
import { EventBus, GameEvents } from '../../../utils/EventBus';

export interface DialogComponentConfig {
    type: 'dialog';
    greeting: string;
    success?: string;
    failure?: string;
}

/**
 * Provides dialog capability to an NPC.
 * Creates a DialogBox and shows greeting lines when the player interacts.
 * Emits dialog events and calls back when dialog ends.
 */
export class DialogComponent implements NPCComponent {
    readonly type = 'dialog';
    private npc!: BaseNPC;
    private dialogBox: DialogBox | null = null;
    private config: DialogComponentConfig;
    private onDialogEndCallback: (() => void) | null = null;

    constructor(config: DialogComponentConfig) {
        this.config = config;
    }

    init(npc: BaseNPC): void {
        this.npc = npc;
        this.dialogBox = new DialogBox(npc.scene);

        // Listen for dialog end to release interaction lock
        EventBus.on(GameEvents.DIALOG_END, this.onDialogEnd, this);
    }

    update(_delta: number): void {
        // Nothing per-frame
    }

    onInteract(): void {
        this.showGreeting();
    }

    /** Show the greeting dialog lines */
    showGreeting(onEnd?: () => void): void {
        this.onDialogEndCallback = onEnd ?? null;
        const lines = this.buildLines(this.config.greeting);
        this.dialogBox?.show(lines);
    }

    /** Show success dialog after a correct math answer */
    showSuccess(onEnd?: () => void): void {
        this.onDialogEndCallback = onEnd ?? null;
        const lines = this.buildLines(this.config.success ?? 'success_default');
        this.dialogBox?.show(lines);
    }

    /** Show failure dialog */
    showFailure(onEnd?: () => void): void {
        this.onDialogEndCallback = onEnd ?? null;
        const lines = this.buildLines(this.config.failure ?? 'failure_default');
        this.dialogBox?.show(lines);
    }

    /** Advance the dialog (call when interact is pressed during dialog) */
    advance(): void {
        this.dialogBox?.advance();
    }

    isDialogVisible(): boolean {
        return this.dialogBox?.getIsVisible() ?? false;
    }

    private buildLines(key: string): DialogLine[] {
        // Simple lookup: generate lines from key name
        // In a full implementation, these would come from a dialog JSON file
        const name = this.npc.definition.name;

        const dialogMap: Record<string, DialogLine[]> = {
            greeting_owl: [
                { speaker: name, text: 'Hoo-hoo! Hello there, little crow!' },
                { speaker: name, text: 'I have a math challenge for you. Ready?' },
            ],
            success_owl: [
                { speaker: name, text: 'Excellent work! You got it right!' },
                { speaker: name, text: 'Here, take this reward!' },
            ],
            failure_owl: [
                { speaker: name, text: 'Not quite right, but keep trying!' },
            ],
            success_default: [
                { speaker: name, text: 'Well done!' },
            ],
            failure_default: [
                { speaker: name, text: 'Better luck next time!' },
            ],
        };

        return dialogMap[key] ?? [
            { speaker: name, text: `Hello! I'm ${name}.` },
        ];
    }

    private onDialogEnd = (): void => {
        this.npc.endInteraction();
        if (this.onDialogEndCallback) {
            const cb = this.onDialogEndCallback;
            this.onDialogEndCallback = null;
            cb();
        }
    };

    destroy(): void {
        EventBus.off(GameEvents.DIALOG_END, this.onDialogEnd, this);
        this.dialogBox?.destroy();
        this.dialogBox = null;
    }
}
