import { InputState } from '../utils/Types';

export class InputManager {
    private scene: Phaser.Scene;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private wasd!: {
        W: Phaser.Input.Keyboard.Key;
        A: Phaser.Input.Keyboard.Key;
        S: Phaser.Input.Keyboard.Key;
        D: Phaser.Input.Keyboard.Key;
    };
    private spaceKey!: Phaser.Input.Keyboard.Key;
    private eKey!: Phaser.Input.Keyboard.Key;
    private ctrlKey!: Phaser.Input.Keyboard.Key;
    private escKey!: Phaser.Input.Keyboard.Key;

    // Touch controls (injected later for mobile)
    private touchState: InputState = {
        left: false,
        right: false,
        up: false,
        jumpJustPressed: false,
        jumpHeld: false,
        interact: false,
        shoot: false,
    };

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    setup(): void {
        if (this.scene.input.keyboard) {
            this.cursors = this.scene.input.keyboard.createCursorKeys();
            this.wasd = {
                W: this.scene.input.keyboard.addKey('W'),
                A: this.scene.input.keyboard.addKey('A'),
                S: this.scene.input.keyboard.addKey('S'),
                D: this.scene.input.keyboard.addKey('D'),
            };
            this.spaceKey = this.scene.input.keyboard.addKey('SPACE');
            this.eKey = this.scene.input.keyboard.addKey('E');
            this.ctrlKey = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL);
            this.escKey = this.scene.input.keyboard.addKey('ESC');
        }
    }

    getInput(): InputState {
        const kb = this.cursors;

        const left = kb?.left.isDown || this.wasd?.A.isDown || this.touchState.left || false;
        const right = kb?.right.isDown || this.wasd?.D.isDown || this.touchState.right || false;
        const up = kb?.up.isDown || this.wasd?.W.isDown || this.touchState.up || false;

        const jumpJustPressed =
            Phaser.Input.Keyboard.JustDown(this.spaceKey) ||
            Phaser.Input.Keyboard.JustDown(kb?.up!) ||
            Phaser.Input.Keyboard.JustDown(this.wasd?.W) ||
            this.touchState.jumpJustPressed ||
            false;

        const jumpHeld =
            this.spaceKey?.isDown ||
            kb?.up.isDown ||
            this.wasd?.W.isDown ||
            this.touchState.jumpHeld ||
            false;

        const interact =
            Phaser.Input.Keyboard.JustDown(this.eKey) ||
            this.touchState.interact ||
            false;

        const shoot =
            Phaser.Input.Keyboard.JustDown(this.ctrlKey) ||
            this.touchState.shoot ||
            false;

        // Reset touch one-shot states after reading
        this.touchState.jumpJustPressed = false;
        this.touchState.interact = false;
        this.touchState.shoot = false;

        return { left, right, up, jumpJustPressed, jumpHeld, interact, shoot };
    }

    /** Called by TouchControls to update touch input state */
    setTouchState(partial: Partial<InputState>): void {
        Object.assign(this.touchState, partial);
    }

    isEscPressed(): boolean {
        return Phaser.Input.Keyboard.JustDown(this.escKey);
    }
}
