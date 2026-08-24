// ============================================================
// Theme System Type Definitions
// ============================================================

export interface ThemePalette {
    // --- Structural roles. Every theme has always carried these. ---
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

    // --- The Fixed Nine. Identical in every theme, by design. ---
    // See brand/BRAND_SYSTEM.md section 6.1. `notyet` is the wrong-answer amber
    // and `hurt` is the damage red; they are never swapped for one another.
    ink: string;
    paper: string;
    coin: string;
    owl: string;
    yes: string;
    notyet: string;
    hurt: string;
    hero: string;
    focus: string;

    // --- World variables. These are what make one world look unlike another. ---
    ink_world: string;
    sky_top: string;
    sky_bottom: string;
    far: string;
    mid: string;
    deep: string;
    ground_lit: string;
    ground_shadow: string;
    light: string;
    // Hazards are two-tone: no single value clears 3:1 against both a lit and a
    // shadowed ground, so `hazard_base` is the dark half of the pair.
    hazard: string;
    hazard_base: string;
    enemy_pop: string;

    // --- Overlay and effect roles. ---
    scrim: string;
    scrim_soft: string;
    text_light: string;
    text_dim: string;
    text_error: string;
    danger_flash: string;
    death_text: string;
    dust: string;
    spike: string;
    laser: string;
    muzzle: string;
    touch_panel: string;
    touch_label: string;
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

/** One tile's semantic role within a tileset sheet. */
export interface TilesetTile {
    index: number;
    role: string;
    collides: boolean;
}

/**
 * A live tileset. `key` is the Phaser texture key AND the tileset name compiled
 * maps refer to - `GameScene.loadTiledLevel()` calls
 * `map.addTilesetImage(name, name, ...)`, so the two must match.
 */
export interface TilesetEntry {
    key: string;
    theme: string | null;
    image: string;
    source: 'generated' | 'authored';
    note?: string;
    tiles: TilesetTile[];
}

export interface TilesetManifest {
    tileWidth: number;
    tileHeight: number;
    columns: number;
    rows: number;
    tilesets: TilesetEntry[];
}

/** Parallax layer scroll factors and base colours. See brand/BRAND_SYSTEM.md section 5.4. */
export interface ThemeParallaxLayer {
    scroll: number;
    color?: string;
    colors?: string[];
}

/**
 * World binding for a theme: which level it dresses, what its material is
 * called, and the tileset and parallax it expects. Additive - nothing reads
 * this yet, and the tileset it names may not exist on disk.
 */
export interface ThemeWorld {
    level: string;
    material: string;
    tileset: string;
    parallax: Record<string, ThemeParallaxLayer>;
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
    /** Present on the five world themes; absent on the two legacy skins. */
    world?: ThemeWorld;
}
