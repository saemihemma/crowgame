/**
 * Level Tileset Generator
 *
 * Combines individual tile images into a single tileset spritesheet.
 * Uses ONLY the 2 best tiles: top3 (ground surface) and bottom2 (dirt fill).
 *
 * Input:  top3.png, bottom2.png
 * Output: level1_tiles.png (32×64, 1×2 grid, 32×32 per tile)
 *
 * IMPORTANT: Preserves transparent spacing at top of top tiles for proper alignment.
 *
 * Usage: node tools/create_level_tileset.js
 */

const sharp = require('sharp');
const path = require('path');

const TILE_SIZE = 32;
const TILES_PER_ROW = 1;  // Single column
const ROWS = 2;  // 2 rows (top3, bottom2)

async function createLevelTileset() {
    const inputDir = 'C:\\Users\\saemundur\\Desktop\\Crow\\public\\assets\\tilesets\\level1';
    const outputPath = 'C:\\Users\\saemundur\\Desktop\\Crow\\public\\assets\\tilesets\\level1_tiles.png';

    const topTiles = ['top3.png'];  // ONLY top3 - the best top tile
    const bottomTiles = ['bottom2.png'];  // ONLY bottom2 - the best bottom tile

    console.log('\n' + '='.repeat(70));
    console.log('LEVEL TILESET GENERATOR');
    console.log('='.repeat(70) + '\n');

    console.log(`Target tile size: ${TILE_SIZE}×${TILE_SIZE} px`);
    console.log(`Output spritesheet: ${TILES_PER_ROW}×${ROWS} grid (${TILE_SIZE * TILES_PER_ROW}×${TILE_SIZE * ROWS} total)\n`);

    // Process all tiles
    const processedTiles = [];

    // Row 1: Top tiles (ground surface with grass)
    console.log('Processing top tiles (ground surface):');
    for (let i = 0; i < topTiles.length; i++) {
        const tilePath = path.join(inputDir, topTiles[i]);
        const tileBuffer = await processTile(tilePath, `top${i + 1}`, true);
        processedTiles.push(tileBuffer);
    }

    // Row 2: Bottom tiles (dirt fill)
    console.log('\nProcessing bottom tiles (dirt fill):');
    for (let i = 0; i < bottomTiles.length; i++) {
        const tilePath = path.join(inputDir, bottomTiles[i]);
        const tileBuffer = await processTile(tilePath, `bottom${i + 1}`, false);
        processedTiles.push(tileBuffer);
    }

    // Create spritesheet
    console.log('\n' + '─'.repeat(70));
    console.log('Creating spritesheet...');

    const sheetWidth = TILE_SIZE * TILES_PER_ROW;
    const sheetHeight = TILE_SIZE * ROWS;

    const composites = processedTiles.map((buffer, index) => {
        const row = Math.floor(index / TILES_PER_ROW);
        const col = index % TILES_PER_ROW;
        return {
            input: buffer,
            left: col * TILE_SIZE,
            top: row * TILE_SIZE
        };
    });

    const outputSheet = await sharp({
        create: {
            width: sheetWidth,
            height: sheetHeight,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
    })
    .composite(composites)
    .png()
    .toFile(outputPath);

    console.log(`✓ Saved tileset: ${path.basename(outputPath)}`);
    console.log(`  Size: ${outputSheet.width}×${outputSheet.height}`);
    console.log(`  Tile grid: ${TILES_PER_ROW}×${ROWS} (${TILE_SIZE}×${TILE_SIZE} per tile)\n`);

    console.log('─'.repeat(70));
    console.log('TILESET LAYOUT (MINIMAL - ONLY 2 TILES):');
    console.log('─'.repeat(70));
    console.log('┌────┐');
    console.log('│ 1  │  ← top3.png (ground surface, has transparency)');
    console.log('├────┤');
    console.log('│ 2  │  ← bottom2.png (underground fill)');
    console.log('└────┘\n');
    console.log('NOTE: Using ONLY the 2 best tiles to avoid weird mixing');
    console.log('      All ground tiles → top3, All dirt tiles → bottom2\n');

    console.log('─'.repeat(70));
    console.log('NEXT STEPS:');
    console.log('─'.repeat(70));
    console.log('1. Run tile remapping script to update existing levels');
    console.log('   (Remap ALL tiles → tile 1 for ground, tile 2 for dirt)');
    console.log('2. Update tilecount: 8 → 2 and columns: 4 → 1 in level JSON');
    console.log('3. Test levels in-game - uniform look, no weird mixing');
    console.log('4. Clean, consistent visual style achieved!\n');
    console.log('='.repeat(70) + '\n');
}

/**
 * Process a single tile image: load, scale to 32×32, preserve transparency
 */
async function processTile(inputPath, tileName, isTopTile) {
    console.log(`  Processing ${tileName}...`);

    const image = sharp(inputPath);
    const metadata = await image.metadata();

    console.log(`    Source: ${metadata.width}×${metadata.height}`);

    // Scale to 32×32 preserving aspect ratio and transparency
    // Use 'contain' to fit within 32×32 while preserving aspect
    // Transparent background ensures transparency is preserved
    const scaledImage = await image
        .resize(TILE_SIZE, TILE_SIZE, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png()
        .toBuffer();

    if (isTopTile) {
        console.log(`    ✓ Scaled to ${TILE_SIZE}×${TILE_SIZE} (preserved top transparency)`);
    } else {
        console.log(`    ✓ Scaled to ${TILE_SIZE}×${TILE_SIZE}`);
    }

    return scaledImage;
}

createLevelTileset()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('\nERROR:', err.message);
        console.error(err.stack);
        process.exit(1);
    });
