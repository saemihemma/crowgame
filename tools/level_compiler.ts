import { join, resolve } from 'path';

export const ROOT = resolve(join(__dirname, '..'));
export const DATA_DIR = join(ROOT, 'godot', 'data');
export const SPECS_DIR = join(DATA_DIR, 'levels', 'specs');
export const OUTPUT_DIR = join(DATA_DIR, 'levels', 'compiled');

const TILE_SIZE = 32;

/**
 * GIDs, which are tileset indices + firstgid(1). The sheet is a 4x4 of 32px
 * tiles laid out by tools/gen_tilesets.mjs; this is the other half of that
 * contract and the two have to agree.
 *
 * Only the first three of these were ever placed. That had two consequences
 * worth fixing together: a platform run was the same tile repeated, so a
 * three-wide ledge had no left or right end and read as a slab; and because
 * there was exactly one tile per role, the tile art had to stay non-figurative
 * or it printed as wallpaper -- which left distinctive marks with nowhere to go.
 * Caps end a run. Scatter marks go in the decoration layer, which the compiler
 * has always emitted and always left full of zeroes.
 */
export const GID = {
    groundSurface: 1,
    groundFill: 2,
    platform: 3,
    groundCapLeft: 4,
    groundCapRight: 5,
    platformCapLeft: 6,
    platformCapRight: 7,
    scatter: [8, 9, 10],
} as const;

/** Tile ids (GID - 1) that carry collision. The caps are the same ledge. */
export const COLLIDING_TILE_IDS = [0, 1, 2, 3, 4, 5, 6];

/**
 * How often a surface cell gets something growing on it, and how far apart two
 * marks must be.
 *
 * Sparse on purpose. The decoration layer exists so a world has incidental
 * detail, not so it has a hedge: at one-in-three the scatter became a texture
 * and the ground stopped reading as ground. One in seven with a two-cell
 * minimum gap gives a mark every couple of screens' worth of walking.
 */
const SCATTER_RATE = 0.14;
const SCATTER_MIN_GAP = 2;

/**
 * Deterministic 0..1 from a level id and a cell. Seeded from the level so two
 * compiles of the same spec are byte-identical -- the compiled maps are
 * committed, and a compiler whose output moved on every run would make every
 * diff unreadable.
 */
function scatterNoise(levelId: string, x: number, y: number): number {
    let h = 2166136261;
    for (let i = 0; i < levelId.length; i++) {
        h = Math.imul(h ^ levelId.charCodeAt(i), 16777619);
    }
    h = Math.imul(h ^ x, 16777619);
    h = Math.imul(h ^ (y + 0x9e37), 16777619);
    h ^= h >>> 15;
    return ((h >>> 0) % 100000) / 100000;
}

export interface LevelSpec {
    id: string;
    name: string;
    theme: string;
    difficulty: number;
    music?: string;
    platforms: Array<{
        type: 'ground' | 'platform';
        x: number;
        width: number;
        y: number;
        gap_before?: number;
    }>;
    spawns: {
        player: { x: number; y: number };
        npcs?: Array<{ npc_id: string; x: number; y: number; bonus?: boolean; requiresAbility?: string }>;
        collectibles?: Array<{ type: string; x: number; y: number; id?: string }>;
    };
    hazards?: Array<{ type: string; x: number; y: number; width?: number; height?: number }>;
    enemies?: Array<{ enemy_id: string; x: number; y: number }>;
    exits: Array<{ x: number; y: number; target_level: string }>;
}

export interface TiledMap {
    width: number;
    height: number;
    tilewidth: number;
    tileheight: number;
    orientation: string;
    renderorder: string;
    type: string;
    version: string;
    tiledversion: string;
    layers: TiledLayer[];
    tilesets: TiledTileset[];
}

interface TiledLayer {
    name: string;
    type: 'tilelayer' | 'objectgroup';
    width?: number;
    height?: number;
    data?: number[];
    objects?: TiledObject[];
    visible: boolean;
    opacity: number;
    x: number;
    y: number;
}

interface TiledObject {
    id: number;
    name: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    properties?: Array<{ name: string; type: string; value: string | number | boolean }>;
}

interface TiledTileset {
    firstgid: number;
    name: string;
    tilewidth: number;
    tileheight: number;
    tilecount: number;
    columns: number;
    image: string;
    imagewidth: number;
    imageheight: number;
    tiles?: Array<{
        id: number;
        properties: Array<{ name: string; type: string; value: boolean }>;
    }>;
}

// A bonus owl is not part of what clears the level.
//
// The door waits for the level's owls, and one hard-to-reach owl meant to be
// revisited with a better crow must never be able to lock a level behind it. So
// `bonus` travels with the spawn and LevelManager derives the door's requirement
// from it, rather than a human writing "this level needs 2" next to a level that
// holds 3 and getting it wrong once.
//
// `requiresAbility` is the other half: check_level_reachability.py reads it and
// INVERTS its rule for that owl -- a declared owl that the crow can already
// reach fails, because then the climb is not a climb.
function npcProperties(npc: { npc_id: string; bonus?: boolean; requiresAbility?: string }) {
    const props: Array<{ name: string; type: string; value: string | boolean }> = [
        { name: 'npc_id', type: 'string', value: npc.npc_id },
    ];
    if (npc.bonus) props.push({ name: 'bonus', type: 'bool', value: true });
    if (npc.requiresAbility) {
        props.push({ name: 'requires_ability', type: 'string', value: npc.requiresAbility });
    }
    return props;
}

export function compileLevel(spec: LevelSpec): TiledMap {
    let maxX = 0;
    let maxY = 0;
    for (const platform of spec.platforms) {
        const right = platform.x + platform.width;
        if (right > maxX) maxX = right;
        if (platform.y + 1 > maxY) maxY = platform.y + 1;
    }

    const mapWidth = maxX + 4;
    const mapHeight = Math.max(maxY + 2, 20);
    const groundData = new Array(mapWidth * mapHeight).fill(0);

    const decorationData = new Array(mapWidth * mapHeight).fill(0);
    // Where the last scatter mark went, per row, so two never end up adjacent.
    const lastScatterX = new Map<number, number>();

    for (const platform of spec.platforms) {
        const isGround = platform.type === 'ground';
        const last = platform.x + platform.width - 1;
        for (let x = platform.x; x <= last; x++) {
            if (x < 0 || x >= mapWidth || platform.y < 0 || platform.y >= mapHeight) continue;

            // A one-wide platform gets the plain tile: it is all end and no
            // middle, and capping both sides of a single cell leaves nothing
            // between the two inked edges.
            const capsFit = platform.width > 1;
            const atLeft = capsFit && x === platform.x;
            const atRight = capsFit && x === last;
            let gid: number;
            if (isGround) {
                gid = atLeft ? GID.groundCapLeft : atRight ? GID.groundCapRight : GID.groundSurface;
            } else {
                gid = atLeft ? GID.platformCapLeft : atRight ? GID.platformCapRight : GID.platform;
            }
            groundData[platform.y * mapWidth + x] = gid;

            if (isGround) {
                for (let y = platform.y + 1; y < mapHeight; y++) {
                    groundData[y * mapWidth + x] = GID.groundFill;
                }
            }

            // Scatter goes on the row ABOVE the surface, and never on a capped
            // cell: a tuft hanging over the end of a ledge looks like it is
            // falling off. Skipped where something else already occupies that
            // cell, which is what keeps a stacked platform clean.
            const above = platform.y - 1;
            if (atLeft || atRight || above < 0) continue;
            if (groundData[above * mapWidth + x] !== 0) continue;
            const since = x - (lastScatterX.get(above) ?? Number.NEGATIVE_INFINITY);
            if (since <= SCATTER_MIN_GAP) continue;
            const roll = scatterNoise(spec.id, x, above);
            if (roll >= SCATTER_RATE) continue;
            decorationData[above * mapWidth + x] =
                GID.scatter[Math.floor((roll / SCATTER_RATE) * GID.scatter.length) % GID.scatter.length];
            lastScatterX.set(above, x);
        }
    }

    const objects: TiledObject[] = [];
    let objectId = 1;

    objects.push({
        id: objectId++,
        name: 'player_spawn',
        type: 'player_spawn',
        x: spec.spawns.player.x * TILE_SIZE,
        y: spec.spawns.player.y * TILE_SIZE,
        width: TILE_SIZE,
        height: TILE_SIZE * 2,
    });

    for (const npc of spec.spawns.npcs || []) {
        objects.push({
            id: objectId++,
            name: npc.npc_id,
            type: 'npc',
            x: npc.x * TILE_SIZE,
            y: npc.y * TILE_SIZE,
            width: TILE_SIZE * 2,
            height: TILE_SIZE * 2,
            properties: npcProperties(npc),
        });
    }

    for (const col of spec.spawns.collectibles || []) {
        // A big coin is its OWN object type, not a collectible with a label.
        // spawn_registry.json maps a Tiled object type to a scene, and these two
        // are different objects: an ordinary coin drops into a lifetime purse,
        // and a big coin is a third of a level's progress that has to remember
        // whether this child already has it.
        //
        // `id` travels with it and is required for big coins (validated in
        // validate-content.ts). It is what the save records, so moving a coin or
        // reordering the spawns cannot silently wipe a child's record the way a
        // positional index would.
        const isBig = col.type === 'big_coin';
        const properties: Array<{ name: string; type: string; value: string }> = [
            { name: 'collectible_type', type: 'string', value: col.type },
        ];
        if (isBig) properties.push({ name: 'coin_id', type: 'string', value: col.id ?? '' });
        objects.push({
            id: objectId++,
            name: col.type,
            type: isBig ? 'big_coin' : 'collectible',
            x: col.x * TILE_SIZE,
            y: col.y * TILE_SIZE,
            width: TILE_SIZE,
            height: TILE_SIZE,
            properties,
        });
    }

    for (const exit of spec.exits) {
        objects.push({
            id: objectId++,
            name: 'exit',
            type: 'door',
            x: exit.x * TILE_SIZE,
            y: exit.y * TILE_SIZE,
            width: TILE_SIZE,
            height: TILE_SIZE * 2,
            properties: [
                { name: 'target_level', type: 'string', value: exit.target_level },
            ],
        });
    }

    for (const hazard of spec.hazards || []) {
        const w = (hazard.width || 1) * TILE_SIZE;
        const h = (hazard.height || 1) * TILE_SIZE;
        objects.push({
            id: objectId++,
            name: hazard.type,
            type: 'hazard',
            x: hazard.x * TILE_SIZE,
            y: hazard.y * TILE_SIZE,
            width: w,
            height: h,
            properties: [
                { name: 'hazard_type', type: 'string', value: hazard.type },
            ],
        });
    }

    for (const enemy of spec.enemies || []) {
        objects.push({
            id: objectId++,
            name: enemy.enemy_id,
            type: 'enemy',
            x: enemy.x * TILE_SIZE,
            y: enemy.y * TILE_SIZE,
            width: TILE_SIZE * 1.5,
            height: TILE_SIZE,
            properties: [
                { name: 'enemy_id', type: 'string', value: enemy.enemy_id },
            ],
        });
    }

    const tileset: TiledTileset = {
        firstgid: 1,
        name: `${spec.theme}_tiles`,
        tilewidth: TILE_SIZE,
        tileheight: TILE_SIZE,
        tilecount: 16,
        columns: 4,
        image: `../../assets/tilesets/${spec.theme}_tiles.png`,
        imagewidth: 128,
        imageheight: 128,
        tiles: COLLIDING_TILE_IDS.map(id => ({
            id,
            properties: [{ name: 'collides', type: 'bool' as const, value: true }],
        })),
    };

    return {
        width: mapWidth,
        height: mapHeight,
        tilewidth: TILE_SIZE,
        tileheight: TILE_SIZE,
        orientation: 'orthogonal',
        renderorder: 'right-down',
        type: 'map',
        version: '1.10',
        tiledversion: '1.11.2',
        layers: [
            {
                name: 'background',
                type: 'tilelayer',
                width: mapWidth,
                height: mapHeight,
                data: new Array(mapWidth * mapHeight).fill(0),
                visible: true,
                opacity: 1,
                x: 0,
                y: 0,
            },
            {
                name: 'ground',
                type: 'tilelayer',
                width: mapWidth,
                height: mapHeight,
                data: groundData,
                visible: true,
                opacity: 1,
                x: 0,
                y: 0,
            },
            {
                name: 'decoration',
                type: 'tilelayer',
                width: mapWidth,
                height: mapHeight,
                data: decorationData,
                visible: true,
                opacity: 1,
                x: 0,
                y: 0,
            },
            {
                name: 'objects',
                type: 'objectgroup',
                objects,
                visible: true,
                opacity: 1,
                x: 0,
                y: 0,
            },
        ],
        tilesets: [tileset],
    };
}
