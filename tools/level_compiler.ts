import { join, resolve } from 'path';

export const ROOT = resolve(join(__dirname, '..'));
export const DATA_DIR = join(ROOT, 'public', 'data');
export const SPECS_DIR = join(DATA_DIR, 'levels', 'specs');
export const OUTPUT_DIR = join(DATA_DIR, 'levels', 'compiled');

const TILE_SIZE = 32;

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
        npcs?: Array<{ npc_id: string; x: number; y: number }>;
        collectibles?: Array<{ type: string; x: number; y: number }>;
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

    for (const platform of spec.platforms) {
        for (let x = platform.x; x < platform.x + platform.width; x++) {
            if (x >= 0 && x < mapWidth && platform.y >= 0 && platform.y < mapHeight) {
                groundData[platform.y * mapWidth + x] = platform.type === 'ground' ? 1 : 3;

                if (platform.type === 'ground') {
                    for (let y = platform.y + 1; y < mapHeight; y++) {
                        groundData[y * mapWidth + x] = 2;
                    }
                }
            }
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
            properties: [
                { name: 'npc_id', type: 'string', value: npc.npc_id },
            ],
        });
    }

    for (const col of spec.spawns.collectibles || []) {
        objects.push({
            id: objectId++,
            name: col.type,
            type: 'collectible',
            x: col.x * TILE_SIZE,
            y: col.y * TILE_SIZE,
            width: TILE_SIZE,
            height: TILE_SIZE,
            properties: [
                { name: 'collectible_type', type: 'string', value: col.type },
            ],
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
        tiles: [
            { id: 0, properties: [{ name: 'collides', type: 'bool', value: true }] },
            { id: 1, properties: [{ name: 'collides', type: 'bool', value: true }] },
            { id: 2, properties: [{ name: 'collides', type: 'bool', value: true }] },
        ],
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
                data: new Array(mapWidth * mapHeight).fill(0),
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
