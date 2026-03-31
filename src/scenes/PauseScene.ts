import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT } from '../utils/Constants';
import { ThemeManager } from '../ui/theme/ThemeManager';
import { DopamineFX } from '../ui/fx/DopamineFX';
import { UINavigator } from '../ui/UINavigator';
import { TextManager } from '../systems/TextManager';

/**
 * Pause overlay scene.
 */
export class PauseScene extends Phaser.Scene {
    private dimOverlay!: Phaser.GameObjects.Rectangle;
    private container!: Phaser.GameObjects.Container;

    constructor() {
        super({ key: SCENES.PAUSE });
    }

    create(): void {
        const tm = ThemeManager.getInstance();
        const tt = TextManager.getInstance();
        const cx = GAME_WIDTH / 2;
        const cy = GAME_HEIGHT / 2;

        this.scene.pause(SCENES.GAME);

        this.dimOverlay = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0)
            .setDepth(200).setScrollFactor(0);

        this.tweens.add({
            targets: this.dimOverlay,
            fillAlpha: 0.5,
            duration: 200,
        });

        this.container = this.add.container(cx, cy).setDepth(210).setScrollFactor(0);

        const panelW = 320;
        const panelH = 240;
        const panelBg = this.add.graphics();
        panelBg.fillStyle(tm.getColorNum('boardBg'), 0.95);
        panelBg.fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 16);
        panelBg.lineStyle(4, tm.getColorNum('boardBorder'), 1);
        panelBg.strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 16);
        this.container.add(panelBg);

        const title = this.add.text(0, -panelH / 2 + 32, tt.t('pause.title'), {
            fontSize: '32px', fontFamily: 'monospace',
            color: tm.getColor('accent'),
            stroke: '#000000', strokeThickness: 4,
        }).setOrigin(0.5, 0.5);
        this.container.add(title);

        const resumeZone = this.createButton(0, -16, tt.t('pause.resume'), () => this.resume());
        const quitZone = this.createButton(0, 56, tt.t('pause.quit'), () => this.quitToMenu());

        const nav = new UINavigator(this, 'vertical');
        nav.addButton({ x: cx, y: cy - 16, width: 200, height: 48,
            onActivate: () => this.resume() });
        nav.addButton({ x: cx, y: cy + 56, width: 200, height: 48,
            onActivate: () => this.quitToMenu() });
        resumeZone.on('pointerover', () => nav.setFocus(0));
        quitZone.on('pointerover', () => nav.setFocus(1));
        this.time.delayedCall(350, () => nav.enable());

        DopamineFX.elasticEntrance(this, this.container, 300);

        this.input.keyboard?.on('keydown-ESC', () => this.resume());
    }

    private createButton(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Zone {
        const tm = ThemeManager.getInstance();
        const btnW = 200;
        const btnH = 48;

        const bg = this.add.graphics();
        bg.fillStyle(tm.getColorNum('accent'), 1);
        bg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 8);
        bg.setPosition(x, y);
        this.container.add(bg);

        const text = this.add.text(x, y, label, {
            fontSize: '24px', fontFamily: 'monospace',
            color: '#ffffff', stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5, 0.5);
        this.container.add(text);

        const zone = this.add.zone(x, y, btnW, btnH).setInteractive({ useHandCursor: true });
        this.container.add(zone);

        zone.on('pointerover', () => text.setScale(1.1));
        zone.on('pointerout', () => text.setScale(1));
        zone.on('pointerdown', onClick);

        return zone;
    }

    private resume(): void {
        this.tweens.add({
            targets: this.dimOverlay,
            fillAlpha: 0,
            duration: 150,
        });
        DopamineFX.elasticExit(this, this.container, 200, () => {
            this.scene.resume(SCENES.GAME);
            this.scene.stop(SCENES.PAUSE);
        });
    }

    private quitToMenu(): void {
        this.scene.stop(SCENES.GAME);
        this.scene.stop(SCENES.HUD);
        this.scene.stop(SCENES.PAUSE);
        this.scene.start(SCENES.MAIN_MENU);
    }
}
