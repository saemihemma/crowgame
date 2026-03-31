import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT } from '../utils/Constants';
import { ThemeManager } from '../ui/theme/ThemeManager';
import { LevelManager } from '../systems/LevelManager';
import { SaveManager } from '../systems/SaveManager';
import { DopamineFX } from '../ui/fx/DopamineFX';
import { UINavigator } from '../ui/UINavigator';
import { TextManager } from '../systems/TextManager';
import type { LevelRegistryEntry } from '../utils/Types';

/**
 * Level selection screen showing available levels as nodes/buttons.
 */
export class LevelSelectScene extends Phaser.Scene {
    private navigator!: UINavigator;

    constructor() {
        super({ key: SCENES.LEVEL_SELECT });
    }

    create(): void {
        const tm = ThemeManager.getInstance();
        const tt = TextManager.getInstance();
        const levels = LevelManager.getInstance().getLevels();
        const save = SaveManager.getInstance().getData();

        // Background
        this.cameras.main.setBackgroundColor(tm.getColor('primary'));
        const bgGfx = this.add.graphics();
        bgGfx.fillGradientStyle(
            tm.getColorNum('primary'), tm.getColorNum('primary'),
            tm.getColorNum('secondary'), tm.getColorNum('secondary'),
            0.9, 0.9, 0.5, 0.5,
        );
        bgGfx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

        // Title
        const title = this.add.text(GAME_WIDTH / 2, 48, tt.t('level_select.title'), {
            fontSize: '36px',
            fontFamily: 'monospace',
            color: tm.getColor('accent'),
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5, 0.5);
        DopamineFX.elasticEntrance(this, title, 300);

        // Keyboard navigation
        this.navigator = new UINavigator(this, 'vertical');

        // Back button
        const backText = this.add.text(32, 32, tt.t('level_select.back'), {
            fontSize: '20px',
            fontFamily: 'monospace',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
        backText.on('pointerdown', () => this.scene.start(SCENES.MAIN_MENU));
        backText.on('pointerover', () => {
            backText.setScale(1.1);
            this.navigator.setFocus(0);
        });
        backText.on('pointerout', () => backText.setScale(1));

        this.navigator.addButton({
            x: 32 + 50, y: 32, width: 100, height: 32,
            onActivate: () => this.scene.start(SCENES.MAIN_MENU),
            onFocus: () => backText.setScale(1.1),
            onBlur: () => backText.setScale(1),
        });

        // Level nodes layout
        const startY = 140;
        const nodeSpacing = 112;
        const cx = GAME_WIDTH / 2;

        const pathGfx = this.add.graphics();
        pathGfx.lineStyle(4, tm.getColorNum('secondary'), 0.5);

        for (let i = 0; i < levels.length; i++) {
            const level = levels[i];
            const nodeY = startY + i * nodeSpacing;

            if (i < levels.length - 1) {
                pathGfx.lineBetween(cx, nodeY + 36, cx, nodeY + nodeSpacing - 36);
            }

            const isCompleted = save.completedLevels.includes(level.key);
            const isUnlocked = this.isLevelUnlocked(level, save.completedLevels);
            const isCurrent = save.currentLevel === level.key;

            this.createLevelNode(cx, nodeY, level, i, isCompleted, isUnlocked, isCurrent);
        }

        const maxDelay = levels.length * 80 + 500;
        this.time.delayedCall(maxDelay, () => this.navigator.enable(1));

        this.input.keyboard?.on('keydown-ESC', () => {
            this.scene.start(SCENES.MAIN_MENU);
        });
    }

    private createLevelNode(
        x: number, y: number, level: LevelRegistryEntry, index: number,
        isCompleted: boolean, isUnlocked: boolean, isCurrent: boolean,
    ): void {
        const tm = ThemeManager.getInstance();
        const tt = TextManager.getInstance();
        const nodeW = 360;
        const nodeH = 80;

        const nodeBg = this.add.graphics();
        if (!isUnlocked) {
            nodeBg.fillStyle(0x555555, 0.6);
        } else if (isCompleted) {
            nodeBg.fillStyle(tm.getColorNum('accent'), 0.3);
        } else {
            nodeBg.fillStyle(tm.getColorNum('secondary'), 0.4);
        }
        nodeBg.fillRoundedRect(x - nodeW / 2, y - nodeH / 2, nodeW, nodeH, 12);

        if (isCurrent && isUnlocked) {
            nodeBg.lineStyle(3, tm.getColorNum('accent'), 0.8);
        } else {
            nodeBg.lineStyle(2, 0xffffff, 0.2);
        }
        nodeBg.strokeRoundedRect(x - nodeW / 2, y - nodeH / 2, nodeW, nodeH, 12);

        const numColor = isUnlocked ? '#ffffff' : '#888888';
        this.add.text(x - nodeW / 2 + 28, y, `${index + 1}`, {
            fontSize: '32px', fontFamily: 'monospace', color: numColor,
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5, 0.5);

        const nameColor = isUnlocked ? tm.getColor('textColor') : '#666666';
        this.add.text(x - 40, y - 12, level.name, {
            fontSize: '20px', fontFamily: 'monospace', color: nameColor,
            stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0, 0.5);

        if (isCompleted) {
            this.add.text(x - 40, y + 16, tt.t('level_select.complete'), {
                fontSize: '16px', fontFamily: 'monospace', color: '#ffd700',
                stroke: '#000000', strokeThickness: 2,
            }).setOrigin(0, 0.5);
        } else if (isUnlocked) {
            this.add.text(x - 40, y + 16, tt.t('level_select.ready'), {
                fontSize: '16px', fontFamily: 'monospace', color: '#88ff88',
                stroke: '#000000', strokeThickness: 2,
            }).setOrigin(0, 0.5);
        } else {
            this.add.text(x + nodeW / 2 - 40, y, '🔒', { fontSize: '28px' }).setOrigin(0.5, 0.5);
            this.add.text(x - 40, y + 16, tt.t('level_select.locked'), {
                fontSize: '16px', fontFamily: 'monospace', color: '#888888',
                stroke: '#000000', strokeThickness: 2,
            }).setOrigin(0, 0.5);
        }

        if (isUnlocked) {
            const zone = this.add.zone(x, y, nodeW, nodeH).setInteractive({ useHandCursor: true });

            const hoverIn = () => {
                nodeBg.clear();
                nodeBg.fillStyle(isCompleted ? tm.getColorNum('accent') : tm.getColorNum('secondary'),
                    isCompleted ? 0.5 : 0.6);
                nodeBg.fillRoundedRect(x - nodeW / 2, y - nodeH / 2, nodeW, nodeH, 12);
                nodeBg.lineStyle(3, tm.getColorNum('accent'), 1);
                nodeBg.strokeRoundedRect(x - nodeW / 2, y - nodeH / 2, nodeW, nodeH, 12);
            };

            const hoverOut = () => {
                nodeBg.clear();
                nodeBg.fillStyle(isCompleted ? tm.getColorNum('accent') : tm.getColorNum('secondary'),
                    isCompleted ? 0.3 : 0.4);
                nodeBg.fillRoundedRect(x - nodeW / 2, y - nodeH / 2, nodeW, nodeH, 12);
                nodeBg.lineStyle(isCurrent ? 3 : 2, isCurrent ? tm.getColorNum('accent') : 0xffffff,
                    isCurrent ? 0.8 : 0.2);
                nodeBg.strokeRoundedRect(x - nodeW / 2, y - nodeH / 2, nodeW, nodeH, 12);
            };

            const navIndex = this.navigator.getItemCount();
            zone.on('pointerover', () => { hoverIn(); this.navigator.setFocus(navIndex); });
            zone.on('pointerout', hoverOut);
            zone.on('pointerdown', () => this.startLevel(level.key));

            this.navigator.addButton({
                x, y, width: nodeW, height: nodeH,
                onActivate: () => this.startLevel(level.key),
                onFocus: hoverIn, onBlur: hoverOut,
            });
        }

        DopamineFX.elasticEntrance(this, nodeBg, 300, index * 80 + 100);
    }

    private isLevelUnlocked(level: LevelRegistryEntry, completedLevels: string[]): boolean {
        if (!level.unlockRequirement) return true;
        return completedLevels.includes(level.unlockRequirement.level);
    }

    private startLevel(levelKey: string): void {
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start(SCENES.GAME, { levelKey });
        });
    }
}
