import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT } from '../utils/Constants';
import { DopamineFX } from '../ui/fx/DopamineFX';
import { ThemeManager } from '../ui/theme/ThemeManager';
import { SaveManager } from '../systems/SaveManager';
import { UINavigator } from '../ui/UINavigator';
import { TextManager } from '../systems/TextManager';
import { ProfileManager } from '../systems/ProfileManager';
import { LanguageToggle } from '../ui/components/LanguageToggle';

/**
 * Main menu / start screen.
 * Shows the game title, an animated crow sprite, and a "Play" button.
 */
export class MainMenuScene extends Phaser.Scene {
    constructor() {
        super({ key: SCENES.MAIN_MENU });
    }

    create(): void {
        const tm = ThemeManager.getInstance();
        const tt = TextManager.getInstance();
        const cx = GAME_WIDTH / 2;
        const cy = GAME_HEIGHT / 2;

        // Background
        this.cameras.main.setBackgroundColor(tm.getColor('primary'));
        const bgGfx = this.add.graphics();
        bgGfx.fillGradientStyle(
            tm.getColorNum('primary'), tm.getColorNum('primary'),
            tm.getColorNum('secondary'), tm.getColorNum('secondary'),
            0.8, 0.8, 0.6, 0.6,
        );
        bgGfx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

        // Animated ground stripe at bottom
        const groundGfx = this.add.graphics();
        groundGfx.fillStyle(tm.getColorNum('secondary'), 0.6);
        groundGfx.fillRect(0, GAME_HEIGHT - 96, GAME_WIDTH, 96);

        // Title text
        const title = this.add.text(cx, 80, tt.t('menu.title'), {
            fontSize: '72px',
            fontFamily: 'monospace',
            color: tm.getColor('accent'),
            stroke: '#000000',
            strokeThickness: 8,
            align: 'center',
        }).setOrigin(0.5, 0.5);

        // Subtitle
        const subtitle = this.add.text(cx, 136, tt.t('menu.subtitle'), {
            fontSize: '20px',
            fontFamily: 'monospace',
            color: tm.getColor('textColor'),
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5, 0.5);

        // Crow sprite
        const crow = this.add.sprite(cx, cy - 20, 'crow');
        const targetSize = 192;
        const scale = targetSize / Math.max(crow.width, crow.height);
        crow.setScale(scale);

        this.tweens.add({
            targets: crow,
            y: cy - 32,
            duration: 1200,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        // Buttons
        const btnW = 240;
        const btnH = 52;
        const saveManager = SaveManager.getInstance();
        const hasExistingSave = saveManager.hasSave();

        const playBtnY = GAME_HEIGHT - (hasExistingSave ? 188 : 148);
        const playBtn = this.createButton(cx, playBtnY, btnW, btnH, tt.t('menu.play'), tm);
        playBtn.zone.on('pointerdown', () => this.goToLevelSelect());

        let continueBtn: { zone: Phaser.GameObjects.Zone; text: Phaser.GameObjects.Text } | null = null;
        if (hasExistingSave) {
            const contBtnY = GAME_HEIGHT - 124;
            continueBtn = this.createButton(cx, contBtnY, btnW, btnH, tt.t('menu.continue'), tm);
            continueBtn.zone.on('pointerdown', () => this.continueGame());
        }

        // Switch User button (top-left)
        const activeUser = ProfileManager.getInstance().getActiveUser();
        if (activeUser) {
            const switchLabel = tt.t('menu.switch_user');
            const switchText = this.add.text(0, 0, switchLabel, {
                fontSize: '16px',
                fontFamily: 'monospace',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 3,
            }).setOrigin(0.5, 0.5);

            const switchWidth = switchText.width + 24;
            const switchHeight = switchText.height + 12;
            const switchX = 24 + switchWidth / 2;
            const switchY = 32;

            const switchBg = this.add.rectangle(
                switchX,
                switchY,
                switchWidth,
                switchHeight,
                tm.getColorNum('secondary'),
                0.55,
            ).setStrokeStyle(2, 0xffffff, 0.22);
            switchText.setPosition(switchX, switchY);

            const switchZone = this.add.zone(
                switchX,
                switchY,
                switchWidth,
                switchHeight,
            ).setInteractive({ useHandCursor: true });

            switchZone.on('pointerdown', () => {
                ProfileManager.getInstance().logout();
                this.scene.start(SCENES.LOGIN);
            });
            switchZone.on('pointerover', () => {
                switchText.setScale(1.04);
                switchBg.setFillStyle(tm.getColorNum('accent'), 0.35);
            });
            switchZone.on('pointerout', () => {
                switchText.setScale(1);
                switchBg.setFillStyle(tm.getColorNum('secondary'), 0.55);
            });
        }

        // Language selector, top-right, balancing Switch User at top-left.
        const languageToggle = new LanguageToggle(this, {
            right: 20,
            top: 16,
            canvasWidth: GAME_WIDTH,
            onChange: () => this.scene.restart(),
        });

        // Keyboard navigation
        const nav = new UINavigator(this, 'vertical');
        nav.addButton({ x: cx, y: playBtnY, width: btnW, height: btnH,
            onActivate: () => this.goToLevelSelect() });
        playBtn.zone.on('pointerover', () => nav.setFocus(0));
        if (hasExistingSave && continueBtn) {
            nav.addButton({ x: cx, y: GAME_HEIGHT - 124, width: btnW, height: btnH,
                onActivate: () => this.continueGame() });
            continueBtn.zone.on('pointerover', () => nav.setFocus(1));
        }
        // Keep the language pills keyboard-reachable like every other control.
        // UINavigator has no index accessor, so track it alongside the pushes.
        let navIndex = hasExistingSave && continueBtn ? 2 : 1;
        const languageZones = languageToggle.getZones();
        languageToggle.getNavButtons().forEach((btn, i) => {
            const index = navIndex++;
            nav.addButton(btn);
            languageZones[i].on('pointerover', () => nav.setFocus(index));
        });

        this.time.delayedCall(600, () => nav.enable());

        // Entrance animations
        DopamineFX.elasticEntrance(this, title, 300);
        DopamineFX.elasticEntrance(this, subtitle, 300, 100);
        DopamineFX.elasticEntrance(this, crow, 400, 200);
        DopamineFX.elasticEntrance(this, playBtn.text, 300, 300);
        if (continueBtn) {
            DopamineFX.elasticEntrance(this, continueBtn.text, 300, 380);
        }
    }

    private createButton(
        x: number, y: number, w: number, h: number, label: string,
        tm: ThemeManager,
    ): { zone: Phaser.GameObjects.Zone; text: Phaser.GameObjects.Text } {
        const bg = this.add.graphics();
        bg.fillStyle(tm.getColorNum('accent'), 1);
        bg.fillRoundedRect(x - w / 2, y - h / 2, w, h, 12);
        bg.lineStyle(4, 0xffffff, 0.4);
        bg.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 12);

        const text = this.add.text(x, y, label, {
            fontSize: '24px',
            fontFamily: 'monospace',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5, 0.5);

        const zone = this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true });

        this.tweens.add({
            targets: [bg],
            alpha: { from: 0.85, to: 1 },
            duration: 600,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        zone.on('pointerover', () => text.setScale(1.1));
        zone.on('pointerout', () => text.setScale(1));

        return { zone, text };
    }

    private goToLevelSelect(): void {
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start(SCENES.LEVEL_SELECT);
        });
    }

    private continueGame(): void {
        const saveManager = SaveManager.getInstance();
        const levelKey = saveManager.getData().currentLevel || 'level_01';

        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start(SCENES.GAME, { levelKey });
        });
    }
}
