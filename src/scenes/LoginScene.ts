import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT } from '../utils/Constants';
import { ThemeManager } from '../ui/theme/ThemeManager';
import { ProfileManager } from '../systems/ProfileManager';
import { SaveManager } from '../systems/SaveManager';
import { ELOManager } from '../math/ELOManager';
import { DopamineFX } from '../ui/fx/DopamineFX';
import { TextManager } from '../systems/TextManager';
import { AudioManager } from '../systems/AudioManager';
import { LearnerStateManager } from '../systems/LearnerStateManager';
import { LearnerSyncService } from '../systems/LearnerSyncService';
import { MathProblemManager } from '../math/MathProblemManager';

type LoginState = 'userList' | 'pinEntry' | 'newUser';

/** Profile button colors for the user list (cycles through these). */
const PROFILE_COLORS = [0x4488ff, 0xff6644, 0x44cc66, 0xcc44cc, 0xffaa22];

/**
 * LoginScene — profile selection / login screen.
 *
 * Three sub-states:
 *  1. userList   — pick an existing profile or create a new one
 *  2. pinEntry   — enter 4-digit PIN for the selected user
 *  3. newUser    — create a new profile (name + PIN + confirm PIN)
 */
export class LoginScene extends Phaser.Scene {
    private state: LoginState = 'userList';

    // Shared references
    private tm!: ThemeManager;
    private txt!: TextManager;

    // Containers per state (destroyed on state switch)
    private stateContainer!: Phaser.GameObjects.Container;

    // PIN entry tracking
    private pinDigits: string[] = [];
    private pinDots: Phaser.GameObjects.Text[] = [];
    private selectedUsername = '';

    // New-user flow
    private newUserName = '';
    private newUserFirstPin = '';
    private isConfirmingPin = false;

    constructor() {
        super({ key: SCENES.LOGIN });
    }

    // ─── Lifecycle ────────────────────────────────────────────

    create(): void {
        this.tm = ThemeManager.getInstance();
        this.txt = TextManager.getInstance();

        // Background — same gradient as MainMenuScene
        this.cameras.main.setBackgroundColor(this.tm.getColor('primary'));

        const bgGfx = this.add.graphics();
        bgGfx.fillGradientStyle(
            this.tm.getColorNum('primary'), this.tm.getColorNum('primary'),
            this.tm.getColorNum('secondary'), this.tm.getColorNum('secondary'),
            0.8, 0.8, 0.6, 0.6,
        );
        bgGfx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

        // Ground stripe
        const groundGfx = this.add.graphics();
        groundGfx.fillStyle(this.tm.getColorNum('secondary'), 0.6);
        groundGfx.fillRect(0, GAME_HEIGHT - 96, GAME_WIDTH, 96);

        this.showState('userList');
    }

    // ─── State Machine ────────────────────────────────────────

    private showState(next: LoginState): void {
        // Tear down previous state container
        if (this.stateContainer) {
            this.stateContainer.destroy();
        }
        this.stateContainer = this.add.container(0, 0);
        this.state = next;

        switch (next) {
            case 'userList':
                this.buildUserList();
                break;
            case 'pinEntry':
                this.buildPinEntry();
                break;
            case 'newUser':
                this.buildNewUser();
                break;
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  STATE 1 — User List
    // ═══════════════════════════════════════════════════════════

    private buildUserList(): void {
        const cx = GAME_WIDTH / 2;
        let delay = 0;

        // Title — "CROW"
        const title = this.add.text(cx, 60, this.txt.t('login.title'), {
            fontSize: '64px',
            fontFamily: 'monospace',
            color: this.tm.getColor('accent'),
            stroke: '#000000',
            strokeThickness: 8,
            align: 'center',
        }).setOrigin(0.5, 0.5);
        this.stateContainer.add(title);
        DopamineFX.elasticEntrance(this, title, 300, delay);
        delay += 80;

        // Subtitle — "Who's playing?"
        const subtitle = this.add.text(cx, 116, this.txt.t('login.subtitle'), {
            fontSize: '22px',
            fontFamily: 'monospace',
            color: this.tm.getColor('textColor'),
            stroke: '#000000',
            strokeThickness: 4,
            align: 'center',
        }).setOrigin(0.5, 0.5);
        this.stateContainer.add(subtitle);
        DopamineFX.elasticEntrance(this, subtitle, 300, delay);
        delay += 80;

        // Profile buttons
        const profiles = ProfileManager.getInstance().getProfiles();
        const btnW = 320;
        const btnH = 64;
        const gap = 16;
        const startY = 180;

        for (let i = 0; i < profiles.length; i++) {
            const profile = profiles[i];
            const y = startY + i * (btnH + gap);
            const color = PROFILE_COLORS[i % PROFILE_COLORS.length];

            const { zone, text } = this.createColorButton(
                cx, y, btnW, btnH, profile.username, color,
            );
            this.stateContainer.add([zone, text]);

            zone.on('pointerdown', () => {
                this.selectedUsername = profile.username;
                this.showState('pinEntry');
            });

            DopamineFX.elasticEntrance(this, text, 300, delay);
            delay += 60;
        }

        // "+ New User" button
        const newBtnY = startY + profiles.length * (btnH + gap) + 12;
        const { zone: newZone, text: newText } = this.createColorButton(
            cx, newBtnY, btnW, btnH,
            this.txt.t('login.new_user'),
            this.tm.getColorNum('accent'),
        );
        this.stateContainer.add([newZone, newText]);

        newZone.on('pointerdown', () => {
            this.showState('newUser');
        });

        DopamineFX.elasticEntrance(this, newText, 300, delay);
    }

    // ═══════════════════════════════════════════════════════════
    //  STATE 2 — PIN Entry
    // ═══════════════════════════════════════════════════════════

    private buildPinEntry(): void {
        const cx = GAME_WIDTH / 2;
        let delay = 0;

        this.pinDigits = [];
        this.pinDots = [];

        // Title
        const titleKey = this.isConfirmingPin ? 'login.confirm_pin' : 'login.enter_pin';
        const title = this.add.text(cx, 60, this.txt.t(titleKey), {
            fontSize: '32px',
            fontFamily: 'monospace',
            color: this.tm.getColor('accent'),
            stroke: '#000000',
            strokeThickness: 6,
            align: 'center',
        }).setOrigin(0.5, 0.5);
        this.stateContainer.add(title);
        DopamineFX.elasticEntrance(this, title, 300, delay);
        delay += 60;

        // Show which user (only in normal login, not new-user confirm flow)
        if (this.selectedUsername && this.state === 'pinEntry' && !this.isConfirmingPin) {
            const userLabel = this.add.text(cx, 100, this.selectedUsername, {
                fontSize: '24px',
                fontFamily: 'monospace',
                color: this.tm.getColor('textColor'),
                stroke: '#000000',
                strokeThickness: 4,
            }).setOrigin(0.5, 0.5);
            this.stateContainer.add(userLabel);
            DopamineFX.elasticEntrance(this, userLabel, 300, delay);
            delay += 60;
        }

        // 4 dot placeholders
        const dotY = 150;
        const dotSpacing = 48;
        const dotStartX = cx - (dotSpacing * 1.5);

        for (let i = 0; i < 4; i++) {
            const dot = this.add.text(dotStartX + i * dotSpacing, dotY, '\u25CB', {
                fontSize: '40px',
                fontFamily: 'monospace',
                color: this.tm.getColor('textColor'),
                stroke: '#000000',
                strokeThickness: 2,
            }).setOrigin(0.5, 0.5);
            this.stateContainer.add(dot);
            this.pinDots.push(dot);
            DopamineFX.elasticEntrance(this, dot, 300, delay);
            delay += 40;
        }

        // Number pad (3 columns x 4 rows: 1-9, then empty/0/empty)
        const padStartY = 220;
        const padBtnSize = 72;
        const padGap = 12;
        const padStartX = cx - (padBtnSize + padGap);

        const layout = [
            ['1', '2', '3'],
            ['4', '5', '6'],
            ['7', '8', '9'],
            ['', '0', ''],
        ];

        for (let row = 0; row < layout.length; row++) {
            for (let col = 0; col < layout[row].length; col++) {
                const digit = layout[row][col];
                if (!digit) continue;

                const bx = padStartX + col * (padBtnSize + padGap);
                const by = padStartY + row * (padBtnSize + padGap);

                const { zone, text } = this.createColorButton(
                    bx, by, padBtnSize, padBtnSize, digit,
                    this.tm.getColorNum('accent'),
                );
                text.setFontSize('36px');
                this.stateContainer.add([zone, text]);

                zone.on('pointerdown', () => this.onPinDigit(digit));

                DopamineFX.elasticEntrance(this, text, 250, delay);
                delay += 25;
            }
        }

        // Back button
        const backY = padStartY + 4 * (padBtnSize + padGap) + 8;
        const { zone: backZone, text: backText } = this.createColorButton(
            cx, backY, 200, 52, this.txt.t('login.back'), this.tm.getColorNum('secondary'),
        );
        this.stateContainer.add([backZone, backText]);

        backZone.on('pointerdown', () => {
            this.isConfirmingPin = false;
            this.newUserFirstPin = '';
            this.showState(this.newUserName ? 'newUser' : 'userList');
        });

        DopamineFX.elasticEntrance(this, backText, 300, delay);
    }

    private onPinDigit(digit: string): void {
        if (this.pinDigits.length >= 4) return;

        this.pinDigits.push(digit);

        // Update dot display
        for (let i = 0; i < 4; i++) {
            this.pinDots[i].setText(i < this.pinDigits.length ? '\u25CF' : '\u25CB');
        }

        AudioManager.getInstance().playSFX('ui_click');

        if (this.pinDigits.length === 4) {
            // Small delay so the kid sees all 4 dots filled
            this.time.delayedCall(250, () => this.onPinComplete());
        }
    }

    private onPinComplete(): void {
        const pin = this.pinDigits.join('');

        // ─── New-user flow ──────────────────────────────────
        if (this.newUserName) {
            if (!this.isConfirmingPin) {
                // First PIN entry — store and ask to confirm
                this.newUserFirstPin = pin;
                this.isConfirmingPin = true;
                this.showState('pinEntry');
                return;
            }

            // Confirming PIN
            if (pin !== this.newUserFirstPin) {
                this.showPinError(this.txt.t('login.pin_mismatch'));
                this.isConfirmingPin = false;
                this.newUserFirstPin = '';
                // Restart PIN entry for new user
                this.time.delayedCall(800, () => this.showState('pinEntry'));
                return;
            }

            // PINs match — create profile
            const result = ProfileManager.getInstance().createProfile(this.newUserName, pin);
            if (result !== true) {
                this.showPinError(result);
                this.resetNewUserFlow();
                this.time.delayedCall(800, () => this.showState('newUser'));
                return;
            }

            // Auto-login the new user
            ProfileManager.getInstance().login(this.newUserName, pin);
            this.loginSuccess();
            return;
        }

        // ─── Existing-user login ────────────────────────────
        const success = ProfileManager.getInstance().login(this.selectedUsername, pin);
        if (success) {
            this.loginSuccess();
        } else {
            this.showPinError(this.txt.t('login.wrong_pin'));
            this.time.delayedCall(800, () => this.showState('pinEntry'));
        }
    }

    private loginSuccess(): void {
        // Switch save profile and initialize ELO
        const saveManager = SaveManager.getInstance();
        saveManager.switchProfile();
        const saveData = saveManager.getData();
        ELOManager.getInstance().initialize(saveData.eloStats);
        LearnerStateManager.getInstance().initialize(
            ProfileManager.getInstance().getActiveProfile(),
            saveData.learnerState,
            ELOManager.getInstance().getStats(),
        );
        MathProblemManager.getInstance().hydrateRecentProblems(
            LearnerStateManager.getInstance().getSnapshot().recentProblemIds,
        );
        LearnerSyncService.getInstance().init(LearnerStateManager.getInstance().getSnapshot());

        // Reset new-user tracking
        this.resetNewUserFlow();

        // Celebrate and transition
        DopamineFX.celebrationBurst(this, GAME_WIDTH / 2, GAME_HEIGHT / 2);
        AudioManager.getInstance().playSFX('ui_click');

        this.cameras.main.fadeOut(400, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start(SCENES.MAIN_MENU);
        });
    }

    private showPinError(message: string): void {
        const cx = GAME_WIDTH / 2;

        // Error text
        const errorText = this.add.text(cx, 130, message, {
            fontSize: '20px',
            fontFamily: 'monospace',
            color: this.tm.getColor('danger'),
            stroke: '#000000',
            strokeThickness: 4,
            align: 'center',
        }).setOrigin(0.5, 0.5);
        this.stateContainer.add(errorText);

        // Shake the dots
        for (const dot of this.pinDots) {
            DopamineFX.wrongShake(this, dot);
        }

        // Clear dots visually
        for (const dot of this.pinDots) {
            dot.setText('\u25CB');
        }
        this.pinDigits = [];
    }

    // ═══════════════════════════════════════════════════════════
    //  STATE 3 — New User
    // ═══════════════════════════════════════════════════════════

    private buildNewUser(): void {
        const cx = GAME_WIDTH / 2;
        let delay = 0;

        this.resetNewUserFlow();

        // Title — "Create Character"
        const title = this.add.text(cx, 80, this.txt.t('login.create_title'), {
            fontSize: '32px',
            fontFamily: 'monospace',
            color: this.tm.getColor('accent'),
            stroke: '#000000',
            strokeThickness: 6,
            align: 'center',
        }).setOrigin(0.5, 0.5);
        this.stateContainer.add(title);
        DopamineFX.elasticEntrance(this, title, 300, delay);
        delay += 80;

        // DOM input element for the name
        const inputHtml =
            `<input type="text" maxlength="12" placeholder="${this.txt.t('login.name_placeholder')}" style="` +
            `font-family: monospace; font-size: 28px; text-align: center; ` +
            `width: 280px; padding: 10px 16px; border: 4px solid ${this.tm.getColor('accent')}; ` +
            `border-radius: 12px; outline: none; background: #222; color: #fff;` +
            `" />`;

        const domElement = this.add.dom(cx, 180).createFromHTML(inputHtml);
        this.stateContainer.add(domElement);

        const inputEl = domElement.node.querySelector('input') as HTMLInputElement | null;

        // "Go!" button
        const goY = 280;
        const { zone: goZone, text: goText } = this.createColorButton(
            cx, goY, 200, 56, this.txt.t('login.go'), this.tm.getColorNum('accent'),
        );
        this.stateContainer.add([goZone, goText]);
        DopamineFX.elasticEntrance(this, goText, 300, delay);
        delay += 60;

        // Error label (hidden until needed)
        const errorLabel = this.add.text(cx, goY + 48, '', {
            fontSize: '18px',
            fontFamily: 'monospace',
            color: this.tm.getColor('danger'),
            stroke: '#000000',
            strokeThickness: 3,
            align: 'center',
        }).setOrigin(0.5, 0.5);
        this.stateContainer.add(errorLabel);

        goZone.on('pointerdown', () => {
            const name = inputEl?.value.trim() ?? '';
            if (!name) {
                errorLabel.setText(this.txt.t('login.name_empty'));
                DopamineFX.wrongShake(this, errorLabel);
                return;
            }
            if (name.length > 12) {
                errorLabel.setText(this.txt.t('login.name_too_long'));
                DopamineFX.wrongShake(this, errorLabel);
                return;
            }

            // Check duplicate before going to PIN
            const existing = ProfileManager.getInstance().getProfiles();
            if (existing.some(p => p.username.toLowerCase() === name.toLowerCase())) {
                errorLabel.setText(this.txt.t('login.name_taken'));
                DopamineFX.wrongShake(this, errorLabel);
                return;
            }

            this.newUserName = name;
            this.isConfirmingPin = false;
            this.newUserFirstPin = '';
            this.showState('pinEntry');
        });

        // Allow Enter key to submit
        if (inputEl) {
            inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Enter') {
                    goZone.emit('pointerdown');
                }
            });
            // Auto-focus after a tick so Phaser DOM is ready
            this.time.delayedCall(100, () => inputEl.focus());
        }

        // Back button
        const backY = 360;
        const { zone: backZone, text: backText } = this.createColorButton(
            cx, backY, 200, 52, this.txt.t('login.back'), this.tm.getColorNum('secondary'),
        );
        this.stateContainer.add([backZone, backText]);

        backZone.on('pointerdown', () => {
            this.resetNewUserFlow();
            this.showState('userList');
        });

        DopamineFX.elasticEntrance(this, backText, 300, delay);
    }

    // ─── Helpers ──────────────────────────────────────────────

    private resetNewUserFlow(): void {
        this.newUserName = '';
        this.newUserFirstPin = '';
        this.isConfirmingPin = false;
        this.pinDigits = [];
    }

    /**
     * Create a rounded, colorful button — kid-friendly and large.
     * Returns the interactive zone and the label text so callers
     * can wire up pointerdown handlers and run entrance animations.
     */
    private createColorButton(
        x: number,
        y: number,
        w: number,
        h: number,
        label: string,
        fillColor: number,
    ): { zone: Phaser.GameObjects.Zone; text: Phaser.GameObjects.Text } {
        const bg = this.add.graphics();
        bg.fillStyle(fillColor, 1);
        bg.fillRoundedRect(x - w / 2, y - h / 2, w, h, 14);
        bg.lineStyle(4, 0xffffff, 0.35);
        bg.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 14);
        this.stateContainer.add(bg);

        const text = this.add.text(x, y, label, {
            fontSize: '26px',
            fontFamily: 'monospace',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 4,
            align: 'center',
        }).setOrigin(0.5, 0.5);

        const zone = this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true });

        // Hover feedback
        zone.on('pointerover', () => text.setScale(1.08));
        zone.on('pointerout', () => text.setScale(1));

        // Gentle pulse on the background
        this.tweens.add({
            targets: bg,
            alpha: { from: 0.88, to: 1 },
            duration: 700,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        return { zone, text };
    }
}
