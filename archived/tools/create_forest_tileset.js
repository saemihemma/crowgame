/**
 * Forest Tileset Generator
 *
 * Creates a proper 128x128 (4x4 grid) forest_tiles.png tileset
 * that matches the compiled level JSON metadata.
 *
 * Tile layout (32x32 each):
 *   Index 0 (0,0):  grass-top surface (from top3.png)
 *   Index 1 (32,0): dirt-fill underground (from bottom2.png)
 *   Index 2 (64,0): platform tile (reuses grass-top)
 *   Remaining:      transparent
 *
 * Usage: node tools/create_forest_tileset.js
 */

const sharp = require('sharp');
const path = require('path');

const TILE_SIZE = 32;
const GRID_SIZE = 4; // 4x4 grid
const SHEET_SIZE = TILE_SIZE * GRID_SIZE; // 128x128

async function createForestTileset() {
    const inputDir = path.resolve(__dirname, '..', 'public', 'assets', 'tilesets', 'level1');
    const outputPath = path.resolve(__dirname, '..', 'public', 'assets', 'tilesets', 'forest_tiles.png');

    console.log('Creating forest_tiles.png (128x128, 4x4 grid)...\n');

    // Load and scale source tiles to 32x32
    const grassTile = await sharp(path.join(inputDir, 'top3.png'))
        .resize(TILE_SIZE, TILE_SIZE, { fit: 'cover' })
        .png()
        .toBuffer();

    const dirtTile = await sharp(path.join(inputDir, 'bottom2.png'))
        .resize(TILE_SIZE, TILE_SIZE, { fit: 'cover' })
        .png()
        .toBuffer();

    // Build the 128x128 tileset with tiles at the correct grid positions
    const result = await sharp({
        create: {
            width: SHEET_SIZE,
            height: SHEET_SIZE,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
    })
    .composite([
        { input: grassTile, left: 0 * TILE_SIZE, top: 0 },              // Index 0: grass surface
        { input: dirtTile,  left: 1 * TILE_SIZE, top: 0 },              // Index 1: dirt fill
        { input: grassTile, left: 2 * TILE_SIZE, top: 0 },              // Index 2: platform (reuse grass)
    ])
    .png()
    .toFile(outputPath);

    console.log(`Done! Saved: ${outputPath}`);
    console.log(`Size: ${result.width}x${result.height}`);
    console.log('\nTile layout:');
    console.log('  Index 0 (tile ID 1): grass-top surface');
    console.log('  Index 1 (tile ID 2): dirt-fill underground');
    console.log('  Index 2 (tile ID 3): platform (grass-top)');
    console.log('  Index 3-15: transparent/empty');
}

createForestTileset()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('ERROR:', err.message);
        process.exit(1);
    });
