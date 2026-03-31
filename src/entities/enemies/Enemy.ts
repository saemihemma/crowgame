import Phaser from 'phaser';

export interface EnemyDefinition {
    id: string;
    name: string;
    spriteKey: string;
    frameWidth: number;
    frameHeight: number;
    behavior: string;
    speed: number;
    damage: number;
    coinReward: number;
}

export interface EnemyRegistry {
    enemies: EnemyDefinition[];
}

export abstract class Enemy {
    public sprite: Phaser.Physics.Arcade.Sprite;
    public definition: EnemyDefinition;
    protected scene: Phaser.Scene;
    private dead = false;

    constructor(scene: Phaser.Scene, x: number, y: number, def: EnemyDefinition) {
        this.scene = scene;
        this.definition = def;
        this.sprite = scene.physics.add.sprite(x, y, def.spriteKey);
        this.sprite.setOrigin(0.5, 1); // Bottom-center alignment (matches cropped sprites)
        this.sprite.setData('enemy', this);
    }

    abstract update(delta: number): void;

    isDead(): boolean {
        return this.dead;
    }

    kill(): void {
        this.dead = true;
        this.sprite.body!.enable = false;
    }

    destroy(): void {
        this.sprite.destroy();
    }
}
