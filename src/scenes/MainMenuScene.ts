import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT } from '../utils/Constants';
import { DopamineFX } from '../ui/fx/DopamineFX';
import { ThemeManager } from '../ui/theme/ThemeManager';
import { SaveManager } from '../systems/SaveManager';
import { UINavigator } from '../ui/UINavigator';
import { TextManager } from '../systems/TextManager';
import { ProfileManager } from '../systems/ProfileManager';
import { LanguageToggle } from '../ui/components/LanguageToggle';
import { LearnerStateManager } from '../systems/LearnerStateManager';
import { SessionStats, type SessionRecap } from '../systems/SessionStats';
import { AudioManager } from '../systems/AudioManager';
import { mathTuning } from '../math/MathTuning';
import type { MathDomain } from '../utils/Types';

const ALL_MATH_DOMAINS: MathDomain[] = [
    'addition', 'subtraction', 'multiplication', 'division',
    'counting', 'comparison', 'pattern_matching', 'number_sequence',
];

/**
 * Main menu / start screen.
 * Shows the game title, an animated crow sprite, and a "Play" button.
 */
export class MainMenuScene extends Phaser.Scene {
    /** True while the session recap overlay owns the screen. */
    private recapOpen = false;

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

        // Hörmann sprite
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

        this.time.delayedCall(600, () => {
            if (!this.recapOpen) nav.enable();
        });

        // Entrance animations
        DopamineFX.elasticEntrance(this, title, 300);
        DopamineFX.elasticEntrance(this, subtitle, 300, 100);
        DopamineFX.elasticEntrance(this, crow, 400, 200);
        DopamineFX.elasticEntrance(this, playBtn.text, 300, 300);
        if (continueBtn) {
            DopamineFX.elasticEntrance(this, continueBtn.text, 300, 380);
        }

        // Trophy shelf: one badge per domain the child has actually met,
        // grown from the highest step ever reached. Badges only ever grow.
        this.drawTrophyShelf(tm, tt);

        // Session-end recap (peak-end rule): arriving here from play with
        // something to celebrate shows one warm recap that ends on the best
        // moment. Consuming resets the counters, so it shows exactly once.
        const recap = SessionStats.getInstance().consume();
        if (recap) {
            this.showRecap(recap, tm, tt, nav);
        }
    }

    /**
     * Code-drawn badge row along the ground stripe. Tier thresholds come
     * from the shared math_tuning.json (`trophies.tierSteps`); shapes are
     * drawn primitives per the i18n house rules (no glyph icons).
     */
    private drawTrophyShelf(tm: ThemeManager, tt: TextManager): void {
        const learner = LearnerStateManager.getInstance();
        const tierSteps = mathTuning().trophies.tierSteps;
        const earned = ALL_MATH_DOMAINS
            .filter(domain => learner.getTotalAttempts(domain) > 0)
            .map(domain => {
                const highest = learner.getHighestStep(domain);
                let tier = -1;
                for (let i = 0; i < tierSteps.length; i++) {
                    if (highest >= tierSteps[i]) tier = i;
                }
                return { domain, tier };
            })
            .filter(badge => badge.tier >= 0);
        if (earned.length === 0) return;

        const spacing = 92;
        const startX = GAME_WIDTH / 2 - ((earned.length - 1) * spacing) / 2;
        const y = GAME_HEIGHT - 52;
        earned.forEach((badge, i) => {
            const x = startX + i * spacing;
            const gfx = this.add.graphics().setDepth(20);
            this.drawBadge(gfx, x, y, badge.tier);
            const label = this.add.text(x, y + 28, tt.t(`domain.${badge.domain}`), {
                fontSize: '12px',
                fontFamily: 'monospace',
                color: tm.getColor('textColor'),
                stroke: '#000000',
                strokeThickness: 2,
            }).setOrigin(0.5, 0.5).setDepth(20);
            DopamineFX.elasticEntrance(this, label, 250, 420 + i * 70);
        });
    }

    /** Tiers: 0 sprout, 1 leaf, 2 flower, 3 star — drawn, not glyphs. */
    private drawBadge(gfx: Phaser.GameObjects.Graphics, x: number, y: number, tier: number): void {
        const green = 0x4caf50;
        const gold = 0xffd700;
        if (tier === 0) {
            // Sprout: a stem with two small leaves.
            gfx.lineStyle(3, green, 1);
            gfx.lineBetween(x, y + 12, x, y - 6);
            gfx.fillStyle(green, 1);
            gfx.fillEllipse(x - 6, y - 2, 12, 7);
            gfx.fillEllipse(x + 6, y - 8, 12, 7);
        } else if (tier === 1) {
            // Leaf: one big leaf on a short stem.
            gfx.lineStyle(3, green, 1);
            gfx.lineBetween(x, y + 12, x, y);
            gfx.fillStyle(green, 1);
            gfx.fillEllipse(x, y - 4, 22, 14);
            gfx.lineStyle(2, 0x2e7d32, 1);
            gfx.lineBetween(x - 9, y - 4, x + 9, y - 4);
        } else if (tier === 2) {
            // Flower: five petals around a bright centre.
            gfx.fillStyle(0xff8ab3, 1);
            for (let p = 0; p < 5; p++) {
                const a = -Math.PI / 2 + (p * 2 * Math.PI) / 5;
                gfx.fillCircle(x + Math.cos(a) * 9, y - 2 + Math.sin(a) * 9, 6);
            }
            gfx.fillStyle(gold, 1);
            gfx.fillCircle(x, y - 2, 5);
        } else {
            // Star: five points, gold.
            const pts: { x: number; y: number }[] = [];
            for (let p = 0; p < 10; p++) {
                const r = p % 2 === 0 ? 14 : 6;
                const a = -Math.PI / 2 + (p * Math.PI) / 5;
                pts.push({ x: x + Math.cos(a) * r, y: y - 2 + Math.sin(a) * r });
            }
            gfx.fillStyle(gold, 1);
            gfx.fillPoints(pts, true);
            gfx.lineStyle(2, 0xb8860b, 1);
            gfx.strokePoints(pts, true);
        }
    }

    /**
     * One warm recap over the menu: counts first, the session's single best
     * moment last (comeback beats golden beats step-up), and an "Onward!"
     * button. Only positive stats are ever rendered.
     */
    private showRecap(recap: SessionRecap, tm: ThemeManager, tt: TextManager, nav: UINavigator): void {
        const cx = GAME_WIDTH / 2;
        const cy = GAME_HEIGHT / 2;

        const dim = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.62)
            .setDepth(500).setInteractive();
        const panel = this.add.graphics().setDepth(501);
        const panelW = 480;

        const lines: string[] = [];
        if (recap.owlsSaved > 0) lines.push(tt.t('recap.owls', recap.owlsSaved));
        if (recap.problemsSolved > 0) lines.push(tt.t('recap.problems', recap.problemsSolved));
        if (recap.stepUps > 0) lines.push(tt.t('recap.stepups', recap.stepUps));
        // Peak-end: the best moment is the last thing on screen before the
        // button. Comeback is the strongest story we can tell about a miss.
        if (recap.comebacks > 0) {
            lines.push(tt.t('recap.best_comeback'));
        } else if (recap.goldenWins > 0) {
            lines.push(tt.t('recap.best_golden'));
        }

        const lineH = 34;
        const panelH = 150 + lines.length * lineH;
        panel.fillStyle(tm.getColorNum('primary'), 0.97);
        panel.fillRoundedRect(cx - panelW / 2, cy - panelH / 2, panelW, panelH, 18);
        panel.lineStyle(4, tm.getColorNum('accent'), 1);
        panel.strokeRoundedRect(cx - panelW / 2, cy - panelH / 2, panelW, panelH, 18);

        const parts: Phaser.GameObjects.GameObject[] = [dim, panel];
        const title = this.add.text(cx, cy - panelH / 2 + 42, tt.t('recap.title'), {
            fontSize: '32px', fontFamily: 'monospace', color: tm.getColor('accent'),
            stroke: '#000000', strokeThickness: 5,
        }).setOrigin(0.5, 0.5).setDepth(502);
        parts.push(title);

        lines.forEach((line, i) => {
            const text = this.add.text(cx, cy - panelH / 2 + 86 + i * lineH, line, {
                fontSize: '20px', fontFamily: 'monospace', color: tm.getColor('textColor'),
                stroke: '#000000', strokeThickness: 3,
            }).setOrigin(0.5, 0.5).setDepth(502);
            parts.push(text);
            DopamineFX.elasticEntrance(this, text, 250, 250 + i * 350);
        });

        const btnY = cy + panelH / 2 - 42;
        const btn = this.createButton(cx, btnY, 200, 46, tt.t('recap.continue'), tm);
        btn.bg.setDepth(502);
        btn.zone.setDepth(503);
        btn.text.setDepth(503);
        parts.push(btn.bg, btn.text, btn.zone);

        AudioManager.getInstance().playSFX('milestone');
        DopamineFX.elasticEntrance(this, title, 300);
        // The recap sits above the menu; its button is the only way out, and
        // the menu's keyboard nav stays parked on the menu buttons below.
        this.recapOpen = true;
        nav.disable();
        btn.zone.on('pointerdown', () => {
            this.recapOpen = false;
            parts.forEach(part => part.destroy());
            nav.enable();
        });
    }

    private createButton(
        x: number, y: number, w: number, h: number, label: string,
        tm: ThemeManager,
    ): { zone: Phaser.GameObjects.Zone; text: Phaser.GameObjects.Text; bg: Phaser.GameObjects.Graphics } {
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

        return { zone, text, bg };
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
