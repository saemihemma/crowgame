import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT } from '../utils/Constants';
import { ThemeManager } from '../ui/theme/ThemeManager';
import { DopamineFX } from '../ui/fx/DopamineFX';
import { UINavigator } from '../ui/UINavigator';
import { TextManager, LOCALE_ENDONYMS, type Locale } from '../systems/TextManager';
import { drawFlag } from '../ui/components/FlagIcon';
import { AudioManager } from '../systems/AudioManager';

/**
 * Pause overlay scene.
 */
export class PauseScene extends Phaser.Scene {
    private dimOverlay!: Phaser.GameObjects.Rectangle;
    private container!: Phaser.GameObjects.Container;
    private titleText!: Phaser.GameObjects.Text;
    private resumeButton?: { text: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone };
    private quitButton?: { text: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone };
    private soundButton?: { text: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone };
    private languageButton?: { text: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone };
    private languageFlag?: Phaser.GameObjects.Graphics;
    private languageRowY = 0;

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
        // Grown from 240 for the two settings rows below. Four 48px buttons plus
        // the title do not fit 240: the last one would land at y 126 against a
        // panel edge at 120.
        const panelH = 320;
        const panelBg = this.add.graphics();
        panelBg.fillStyle(tm.getColorNum('boardBg'), 0.95);
        panelBg.fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 16);
        panelBg.lineStyle(4, tm.getColorNum('boardBorder'), 1);
        panelBg.strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 16);
        this.container.add(panelBg);

        this.titleText = this.add.text(0, -panelH / 2 + 32, tt.t('pause.title'), {
            fontSize: '32px', fontFamily: 'monospace',
            color: tm.getColor('accent'),
            stroke: '#000000', strokeThickness: 4,
        }).setOrigin(0.5, 0.5);
        this.container.add(this.titleText);

        // Pause is the settings surface. It is the only one reachable mid-level,
        // which is what made mid-game language switching possible at all: the
        // live surfaces behind it (HUD, touch controls, an open math board) now
        // re-render in place on LOCALE_CHANGED rather than needing a restart.
        const ROW_Y = [-60, -4, 52, 108];

        const resume = this.createButton(0, ROW_Y[0], tt.t('pause.resume'), () => this.resume());
        this.soundButton = this.createButton(0, ROW_Y[1], this.soundLabel(), () => this.toggleSound());
        const language = this.createButton(0, ROW_Y[2], '', () => this.cycleLocale());
        const quit = this.createButton(0, ROW_Y[3], tt.t('pause.quit'), () => this.quitToMenu());

        this.resumeButton = resume;
        this.quitButton = quit;
        this.languageButton = language;
        this.languageFlag = this.add.graphics();
        this.container.add(this.languageFlag);
        this.paintLanguageRow(ROW_Y[2]);
        this.languageRowY = ROW_Y[2];

        const nav = new UINavigator(this, 'vertical');
        const actions = [
            () => this.resume(),
            () => this.toggleSound(),
            () => this.cycleLocale(),
            () => this.quitToMenu(),
        ];
        const zones = [resume.zone, this.soundButton.zone, language.zone, quit.zone];
        actions.forEach((onActivate, i) => {
            nav.addButton({ x: cx, y: cy + ROW_Y[i], width: 200, height: 48, onActivate });
            zones[i].on('pointerover', () => nav.setFocus(i));
        });
        this.time.delayedCall(350, () => nav.enable());

        DopamineFX.elasticEntrance(this, this.container, 300);

        this.input.keyboard?.on('keydown-ESC', () => this.resume());
    }

    private createButton(
        x: number, y: number, label: string, onClick: () => void,
    ): { text: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone } {
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

        return { text, zone };
    }

    /**
     * "Sound: On" / "Hljóð: Slökkt".
     *
     * This row replaced a theme switcher. A theme is not a setting -- it is a
     * property of a place, and ThemeManager's own docstring says so ("Each
     * world/level can specify a theme"). Nothing ever chose one: Boot set
     * `forest` and the only other caller was the Pause toggle itself, which made
     * it a control standing in for an unbuilt feature. Sound is a setting a
     * parent in a waiting room actually reaches for.
     */
    private soundLabel(): string {
        const tt = TextManager.getInstance();
        const muted = AudioManager.getInstance().isMuted();
        return tt.t('pause.sound', tt.t(muted ? 'sound.off' : 'sound.on'));
    }

    /**
     * The language row is a flag plus the endonym, not a worded label.
     *
     * "Tungumál: Íslenska" is 18 characters, about 272px of monospace at 24px, in
     * a 200px button. The flag carries the meaning instead -- and it is the same
     * flag-plus-endonym pairing the player already met on the login screen and
     * the main menu, so there is nothing new to learn. The endonym is never
     * translated, so someone lost in the wrong language can still get out.
     */
    private paintLanguageRow(y: number): void {
        if (!this.languageButton || !this.languageFlag) return;
        const locale = TextManager.getInstance().getLocale();

        const FLAG_W = 22;
        const FLAG_H = 15;
        const GAP = 9;
        this.languageButton.text.setText(LOCALE_ENDONYMS[locale]);
        const labelW = this.languageButton.text.width;
        const totalW = FLAG_W + GAP + labelW;

        this.languageButton.text.setPosition(-totalW / 2 + FLAG_W + GAP + labelW / 2, y);
        this.languageFlag.clear();
        drawFlag(this.languageFlag, locale, -totalW / 2, y - FLAG_H / 2, FLAG_W, FLAG_H);
    }

    private toggleSound(): void {
        const audio = AudioManager.getInstance();
        const nowMuted = !audio.isMuted();
        // Play the click BEFORE muting, so turning sound off still acknowledges
        // the tap; turning it back on is acknowledged by the click after.
        if (nowMuted) audio.playSFX('ui_click');
        audio.setMuted(nowMuted);
        if (!nowMuted) audio.playSFX('ui_click');
        this.soundButton?.text.setText(this.soundLabel());
    }

    /**
     * Switch language without restarting anything.
     *
     * Everything on screen behind this panel re-renders itself: the HUD, the
     * touch controls, and an open math board all subscribe to LOCALE_CHANGED. The
     * panel's own four labels are the one thing that has to be repainted here,
     * because it is the surface doing the switching.
     */
    private cycleLocale(): void {
        const tt = TextManager.getInstance();
        const codes = tt.availableLocales();
        const next = codes[(codes.indexOf(tt.getLocale()) + 1) % codes.length] as Locale;
        tt.setLocale(next);

        this.titleText?.setText(tt.t('pause.title'));
        this.resumeButton?.text.setText(tt.t('pause.resume'));
        this.quitButton?.text.setText(tt.t('pause.quit'));
        this.soundButton?.text.setText(this.soundLabel());
        this.paintLanguageRow(this.languageRowY);
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
