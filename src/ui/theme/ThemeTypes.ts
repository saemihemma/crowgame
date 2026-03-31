// ============================================================
// Theme System Type Definitions
// ============================================================

export interface ThemePalette {
    primary: string;
    secondary: string;
    accent: string;
    danger: string;
    textColor: string;
    textShadow: string;
    boardBg: string;
    boardBorder: string;
    buttonBg: string;
    buttonText: string;
}

export interface ThemeHUD {
    healthIcon: string;
    healthMax: number;
    coinIcon: string;
    font: string;
}

export interface ThemeMathBoard {
    frameSprite: string;
    bgSprite: string;
    optionSprite: string;
    correctFx: string;
    wrongFx: string;
}

export interface ThemeControls {
    dpadSprite: string;
    jumpBtnSprite: string;
    peckBtnSprite: string;
}

export interface ThemeDoor {
    sprite: string;
    openAnim: string;
}

export interface ThemeDialog {
    frameSprite: string;
    portraitBorder: string;
    textColor: string;
    nameColor: string;
}

export interface ThemeDefinition {
    id: string;
    name: string;
    palette: ThemePalette;
    hud: ThemeHUD;
    mathBoard: ThemeMathBoard;
    controls: ThemeControls;
    door: ThemeDoor;
    dialog: ThemeDialog;
}
