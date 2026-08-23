import Phaser from 'phaser';
import { ThemeManager } from '../theme/ThemeManager';
import {
    TextManager,
    LOCALES,
    LOCALE_ENDONYMS,
    type Locale,
} from '../../systems/TextManager';
import { AudioManager } from '../../systems/AudioManager';

export interface LanguageToggleOptions {
    /** Distance from the right edge of the canvas to the control's right edge. */
    right: number;
    /** Distance from the top of the canvas to the control's top edge. */
    top: number;
    /** Canvas width, so the control can anchor itself to the right edge. */
    canvasWidth: number;
    /** Called after the locale actually changes. Scenes normally restart here. */
    onChange?: (locale: Locale) => void;
}

interface Segment {
    locale: Locale;
    label: Phaser.GameObjects.Text;
    fill: Phaser.GameObjects.Graphics;
    tick: Phaser.GameObjects.Graphics;
    zone: Phaser.GameObjects.Zone;
    centreX: number;
    centreY: number;
}

/**
 * LanguageToggle — the EN/IS language selector.
 *
 * A segmented control rather than a dropdown: with exactly two languages a
 * dropdown hides half the choices behind a tap and hands a five-year-old a menu
 * to get lost in. Both options stay visible, one tap switches, and there is no
 * confirm step.
 *
 * Two deliberate details:
 *  - Each language is labelled in its own language ("English", "Íslenska") and
 *    those labels are never translated. Someone stranded in a language they
 *    cannot read has to be able to find their way back out.
 *  - The selected state is a filled pill *and* a drawn tick, never colour
 *    alone. The tick is vector geometry, not a font glyph, so it cannot become
 *    the missing-glyph box that the PIN dots used to be.
 */
export class LanguageToggle {
    private static readonly PILL_H = 40;
    private static readonly PILL_PAD_X = 14;
    private static readonly TICK_SIZE = 14;
    private static readonly TICK_GAP = 8;
    private static readonly TRACK_PAD = 4;
    private static readonly SEG_GAP = 5;
    private static readonly LABEL_SIZE = 15;

    private readonly container: Phaser.GameObjects.Container;
    private readonly segments: Segment[] = [];
    private readonly onChange?: (locale: Locale) => void;

    constructor(scene: Phaser.Scene, opts: LanguageToggleOptions) {
        this.onChange = opts.onChange;

        const active = TextManager.getInstance().getLocale();

        this.container = scene.add.container(0, 0);

        // Measure every label first so all segments can share one width. Equal
        // segments are what makes this read as a switch instead of two buttons.
        const labels = LOCALES.map(locale =>
            scene.add.text(0, 0, LOCALE_ENDONYMS[locale], {
                fontSize: `${LanguageToggle.LABEL_SIZE}px`,
                fontFamily: 'monospace',
                color: '#ffffff',
            }).setOrigin(0, 0.5),
        );

        const widestLabel = Math.max(...labels.map(l => l.width));
        const contentW = LanguageToggle.TICK_SIZE + LanguageToggle.TICK_GAP + widestLabel;
        const pillW = contentW + LanguageToggle.PILL_PAD_X * 2;
        const trackW =
            pillW * LOCALES.length +
            LanguageToggle.SEG_GAP * (LOCALES.length - 1) +
            LanguageToggle.TRACK_PAD * 2;
        const trackH = LanguageToggle.PILL_H + LanguageToggle.TRACK_PAD * 2;

        const trackX = opts.canvasWidth - opts.right - trackW;
        const trackY = opts.top;

        // Track: a dark recess so the control reads as one grouped switch.
        const track = scene.add.graphics();
        track.fillStyle(0x000000, 0.34);
        track.fillRoundedRect(trackX, trackY, trackW, trackH, 14);
        track.lineStyle(2, 0xffffff, 0.26);
        track.strokeRoundedRect(trackX, trackY, trackW, trackH, 14);
        this.container.add(track);

        LOCALES.forEach((locale, i) => {
            const pillX = trackX + LanguageToggle.TRACK_PAD + i * (pillW + LanguageToggle.SEG_GAP);
            const pillY = trackY + LanguageToggle.TRACK_PAD;
            const centreY = pillY + LanguageToggle.PILL_H / 2;

            const fill = scene.add.graphics();
            const tick = scene.add.graphics();

            const label = labels[i];
            label.setPosition(
                pillX + LanguageToggle.PILL_PAD_X + LanguageToggle.TICK_SIZE + LanguageToggle.TICK_GAP,
                centreY,
            );

            const zone = scene.add
                .zone(pillX + pillW / 2, centreY, pillW, LanguageToggle.PILL_H)
                .setInteractive({ useHandCursor: true });

            this.container.add([fill, tick, label, zone]);

            const seg: Segment = {
                locale,
                label,
                fill,
                tick,
                zone,
                centreX: pillX + pillW / 2,
                centreY,
            };
            this.segments.push(seg);

            this.paintSegment(seg, pillX, pillY, pillW, locale === active);

            zone.on('pointerdown', () => this.select(locale));
            zone.on('pointerover', () => {
                if (this.currentLocale() !== locale) label.setAlpha(1);
            });
            zone.on('pointerout', () => {
                if (this.currentLocale() !== locale) label.setAlpha(0.72);
            });

            // Repaint helpers need the geometry; stash it for select().
            seg.zone.setData('pillX', pillX);
            seg.zone.setData('pillY', pillY);
            seg.zone.setData('pillW', pillW);
        });
    }

    /** Buttons for UINavigator, so the control is keyboard-reachable. */
    getNavButtons(): { x: number; y: number; width: number; height: number; onActivate: () => void }[] {
        return this.segments.map(seg => ({
            x: seg.centreX,
            y: seg.centreY,
            width: seg.zone.width,
            height: seg.zone.height,
            onActivate: () => this.select(seg.locale),
        }));
    }

    /** The interactive zones, so callers can wire hover-to-focus. */
    getZones(): Phaser.GameObjects.Zone[] {
        return this.segments.map(s => s.zone);
    }

    destroy(): void {
        this.container.destroy(true);
    }

    private currentLocale(): Locale {
        return TextManager.getInstance().getLocale();
    }

    private select(locale: Locale): void {
        if (this.currentLocale() === locale) return;

        AudioManager.getInstance().playSFX('ui_click');
        TextManager.getInstance().setLocale(locale);

        // Repaint immediately so the tap feels acknowledged even if the caller
        // takes a frame to restart the scene.
        for (const seg of this.segments) {
            this.paintSegment(
                seg,
                seg.zone.getData('pillX') as number,
                seg.zone.getData('pillY') as number,
                seg.zone.getData('pillW') as number,
                seg.locale === locale,
            );
        }

        this.onChange?.(locale);
    }

    private paintSegment(
        seg: Segment,
        pillX: number,
        pillY: number,
        pillW: number,
        selected: boolean,
    ): void {
        const tm = ThemeManager.getInstance();

        seg.fill.clear();
        if (selected) {
            seg.fill.fillStyle(tm.getColorNum('accent'), 1);
            seg.fill.fillRoundedRect(pillX, pillY, pillW, LanguageToggle.PILL_H, 10);
            seg.fill.lineStyle(2, 0xffffff, 0.5);
            seg.fill.strokeRoundedRect(pillX, pillY, pillW, LanguageToggle.PILL_H, 10);
        }

        seg.label.setColor(selected ? '#231a00' : '#ffffff');
        seg.label.setAlpha(selected ? 1 : 0.72);

        // Tick: drawn, never a glyph. Also means the selected state is not
        // signalled by colour alone, which colour-blind players would miss.
        seg.tick.clear();
        if (!selected) return;

        const size = LanguageToggle.TICK_SIZE;
        const left = pillX + LanguageToggle.PILL_PAD_X;
        const midY = seg.centreY;

        seg.tick.lineStyle(3, 0x231a00, 1);
        seg.tick.beginPath();
        seg.tick.moveTo(left + size * 0.14, midY + size * 0.04);
        seg.tick.lineTo(left + size * 0.4, midY + size * 0.28);
        seg.tick.lineTo(left + size * 0.88, midY - size * 0.3);
        seg.tick.strokePath();
    }
}
