import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT } from '../utils/Constants';
import { ThemeManager } from '../ui/theme/ThemeManager';
import { LevelManager } from '../systems/LevelManager';
import { SaveManager } from '../systems/SaveManager';
import { DopamineFX } from '../ui/fx/DopamineFX';
import { UINavigator } from '../ui/UINavigator';
import { ScrollList } from '../ui/components/ScrollList';
import { TextManager } from '../systems/TextManager';
import type { LevelRegistryEntry } from '../utils/Types';

interface NodeEntry {
    /** Index into UINavigator's item list, or -1 for a locked level. */
    navIndex: number;
    /** Node centre in content space. */
    centreY: number;
}

/**
 * Level selection screen showing available levels as nodes in a scrolling list.
 *
 * The list used to be laid out straight onto the scene at 112px intervals from
 * y=140, which put the sixth of six registry levels at y=700 on a 540-tall
 * canvas: two levels existed and could not be reached. It now lives in a
 * ScrollList, and the row pitch is chosen so the next node always peeks above
 * the fold, which is the clearest "there is more" cue for a young player.
 */
export class LevelSelectScene extends Phaser.Scene {
    private static readonly NODE_W = 360;
    private static readonly NODE_H = 80;
    private static readonly ROW_PITCH = 104;
    private static readonly VIEW_TOP = 84;
    private static readonly VIEW_H = 444;
    /** Breathing room under the last node so it can clear the bottom fade. */
    private static readonly BOTTOM_PAD = 28;
    /** Labels start here, in the gutter left of centre, clear of the padlock. */
    private static readonly LABEL_OFFSET = -110;

    private navigator!: UINavigator;
    private list!: ScrollList;
    private nodes: NodeEntry[] = [];

    constructor() {
        super({ key: SCENES.LEVEL_SELECT });
    }

    create(): void {
        const tm = ThemeManager.getInstance();
        const tt = TextManager.getInstance();
        const levels = LevelManager.getInstance().getLevels();
        const save = SaveManager.getInstance().getData();
        this.nodes = [];

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
        }).setOrigin(0.5, 0.5).setDepth(410);
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
        }).setOrigin(0, 0.5).setDepth(410).setInteractive({ useHandCursor: true });
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

        // Scrolling viewport for the level nodes.
        this.list = new ScrollList(this, {
            x: 0,
            y: LevelSelectScene.VIEW_TOP,
            width: GAME_WIDTH,
            height: LevelSelectScene.VIEW_H,
            // Nodes are 360 wide and centred, so they occupy x 300-660. Put the
            // scroll cue in the right-hand gutter rather than on top of the
            // peeking row's name.
            arrowX: GAME_WIDTH / 2 + 250,
        });

        const cx = GAME_WIDTH / 2;
        const pathGfx = this.add.graphics();
        pathGfx.lineStyle(4, tm.getColorNum('secondary'), 0.5);
        this.list.content.add(pathGfx);

        for (let i = 0; i < levels.length; i++) {
            const level = levels[i];
            const centreY = LevelSelectScene.NODE_H / 2 + i * LevelSelectScene.ROW_PITCH;

            if (i < levels.length - 1) {
                pathGfx.lineBetween(
                    cx, centreY + LevelSelectScene.NODE_H / 2,
                    cx, centreY + LevelSelectScene.ROW_PITCH - LevelSelectScene.NODE_H / 2,
                );
            }

            const isCompleted = save.completedLevels.includes(level.key);
            const isUnlocked = this.isLevelUnlocked(level, save.completedLevels);
            const isCurrent = save.currentLevel === level.key;

            this.createLevelNode(cx, centreY, level, i, isCompleted, isUnlocked, isCurrent);
        }

        const lastCentre = LevelSelectScene.NODE_H / 2
            + (levels.length - 1) * LevelSelectScene.ROW_PITCH;
        this.list.setContentHeight(
            lastCentre + LevelSelectScene.NODE_H / 2 + LevelSelectScene.BOTTOM_PAD,
        );

        // Keep the focus ring with its node while the list moves.
        this.list.onScroll(() => this.syncNavPositions());
        this.syncNavPositions();

        // Land looking at where the player actually is. This is the single
        // biggest quality-of-life win on this screen for a returning child.
        const currentIndex = levels.findIndex(l => l.key === save.currentLevel);
        if (currentIndex > 0) {
            const centreY = LevelSelectScene.NODE_H / 2 + currentIndex * LevelSelectScene.ROW_PITCH;
            this.list.scrollTo(centreY - LevelSelectScene.VIEW_H / 2, false);
            this.syncNavPositions();
        }

        const maxDelay = levels.length * 80 + 500;
        this.time.delayedCall(maxDelay, () => this.navigator.enable(1));

        this.input.keyboard?.on('keydown-ESC', () => {
            this.scene.start(SCENES.MAIN_MENU);
        });
    }

    /** Push current screen positions for every scrolled node into the navigator. */
    private syncNavPositions(): void {
        const offset = LevelSelectScene.VIEW_TOP - this.list.getScrollY();
        for (const node of this.nodes) {
            if (node.navIndex < 0) continue;
            this.navigator.setItemPosition(node.navIndex, GAME_WIDTH / 2, offset + node.centreY);
        }
    }

    /** Whether a node at this content-space centre is actually on screen. */
    private isNodeVisible(centreY: number): boolean {
        const screenY = LevelSelectScene.VIEW_TOP - this.list.getScrollY() + centreY;
        return screenY >= LevelSelectScene.VIEW_TOP
            && screenY <= LevelSelectScene.VIEW_TOP + LevelSelectScene.VIEW_H;
    }

    private createLevelNode(
        cx: number, centreY: number, level: LevelRegistryEntry, index: number,
        isCompleted: boolean, isUnlocked: boolean, isCurrent: boolean,
    ): void {
        const tm = ThemeManager.getInstance();
        const tt = TextManager.getInstance();
        const nodeW = LevelSelectScene.NODE_W;
        const nodeH = LevelSelectScene.NODE_H;
        const labelX = LevelSelectScene.LABEL_OFFSET;

        // Children sit at coordinates relative to the node's own centre, so the
        // whole row can be positioned and scrolled as one object.
        const node = this.add.container(cx, centreY);
        this.list.content.add(node);

        const nodeBg = this.add.graphics();
        const paint = (hovered: boolean) => {
            nodeBg.clear();
            if (!isUnlocked) {
                nodeBg.fillStyle(0x555555, 0.6);
            } else if (isCompleted) {
                nodeBg.fillStyle(tm.getColorNum('accent'), hovered ? 0.5 : 0.3);
            } else {
                nodeBg.fillStyle(tm.getColorNum('secondary'), hovered ? 0.6 : 0.4);
            }
            nodeBg.fillRoundedRect(-nodeW / 2, -nodeH / 2, nodeW, nodeH, 12);

            if (hovered) {
                nodeBg.lineStyle(3, tm.getColorNum('accent'), 1);
            } else if (isCurrent && isUnlocked) {
                nodeBg.lineStyle(3, tm.getColorNum('accent'), 0.8);
            } else {
                nodeBg.lineStyle(2, 0xffffff, 0.2);
            }
            nodeBg.strokeRoundedRect(-nodeW / 2, -nodeH / 2, nodeW, nodeH, 12);
        };
        paint(false);
        node.add(nodeBg);

        const numColor = isUnlocked ? '#ffffff' : '#888888';
        node.add(this.add.text(-nodeW / 2 + 28, 0, `${index + 1}`, {
            fontSize: '32px', fontFamily: 'monospace', color: numColor,
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5, 0.5));

        const nameColor = isUnlocked ? tm.getColor('textColor') : '#666666';
        // Level names are translated when a `level.<key>.name` key exists, and
        // fall back to the registry name so a newly authored level still shows
        // something before anyone translates it.
        const nameKey = `level.${level.key}.name`;
        const levelName = tt.has(nameKey) ? tt.t(nameKey) : level.name;
        node.add(this.add.text(labelX, -12, levelName, {
            fontSize: '20px', fontFamily: 'monospace', color: nameColor,
            stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0, 0.5));

        if (isCompleted) {
            node.add(this.add.text(labelX, 16, tt.t('level_select.complete'), {
                fontSize: '16px', fontFamily: 'monospace', color: '#ffd700',
                stroke: '#000000', strokeThickness: 2,
            }).setOrigin(0, 0.5));
        } else if (isUnlocked) {
            node.add(this.add.text(labelX, 16, tt.t('level_select.ready'), {
                fontSize: '16px', fontFamily: 'monospace', color: '#88ff88',
                stroke: '#000000', strokeThickness: 2,
            }).setOrigin(0, 0.5));
        } else {
            node.add(this.buildPadlock(nodeW / 2 - 24, 0));
            node.add(this.add.text(labelX, 16, tt.t('level_select.locked'), {
                fontSize: '16px', fontFamily: 'monospace', color: '#888888',
                stroke: '#000000', strokeThickness: 2,
            }).setOrigin(0, 0.5));
        }

        let navIndex = -1;

        if (isUnlocked) {
            const zone = this.add.zone(0, 0, nodeW, nodeH).setInteractive({ useHandCursor: true });
            node.add(zone);

            navIndex = this.navigator.getItemCount();
            const myNavIndex = navIndex;

            zone.on('pointerover', () => {
                if (!this.isNodeVisible(centreY)) return;
                paint(true);
                this.navigator.setFocus(myNavIndex);
            });
            zone.on('pointerout', () => paint(false));

            // Activate on pointer *up*, and never when the pointer was dragging:
            // a child scrolling the list must not launch whatever their finger
            // happened to land on. Input hit-testing ignores the scroll mask, so
            // also confirm the node is genuinely on screen.
            zone.on('pointerup', () => {
                if (this.list.wasDrag()) return;
                if (!this.isNodeVisible(centreY)) return;
                this.startLevel(level.key);
            });

            this.navigator.addButton({
                x: cx,
                y: LevelSelectScene.VIEW_TOP + centreY,
                width: nodeW,
                height: nodeH,
                onActivate: () => this.startLevel(level.key),
                onFocus: () => {
                    paint(true);
                    this.list.revealRange(centreY - nodeH / 2, nodeH);
                },
                onBlur: () => paint(false),
            });
        }

        this.nodes.push({ navIndex, centreY });
        DopamineFX.elasticEntrance(this, node, 300, index * 80 + 100);
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

    /**
     * Build the "locked" padlock as vector geometry rather than the emoji
     * U+1F512.
     *
     * The emoji was rendered as text with no font family set at all, so it
     * depended entirely on the device having an emoji font -- the same failure
     * that turned the login PIN dots into missing-glyph boxes. Drawing it
     * removes the font dependency.
     */
    private buildPadlock(cx: number, cy: number): Phaser.GameObjects.Graphics {
        const bodyW = 22;
        const bodyH = 17;
        const bodyTop = cy - 1;
        const g = this.add.graphics();

        // Shackle: an open arc sitting on top of the body.
        g.lineStyle(4, 0xdddddd, 1);
        g.beginPath();
        g.arc(cx, bodyTop, 7, Phaser.Math.DegToRad(180), Phaser.Math.DegToRad(360), false);
        g.strokePath();

        // Body.
        g.fillStyle(0xdddddd, 1);
        g.fillRoundedRect(cx - bodyW / 2, bodyTop, bodyW, bodyH, 4);

        // Keyhole.
        g.fillStyle(0x555555, 1);
        g.fillCircle(cx, bodyTop + bodyH / 2, 2.5);

        return g;
    }
}
