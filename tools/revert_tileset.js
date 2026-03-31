/**
 * Create a 4×4 (128×128) tileset by tiling the 2 existing tiles
 * This restores compatibility with the original level configuration
 */

const sharp = require('sharp');
const path = require('path');

async function createRevertedTileset() {
    const inputPath = 'C:\\Users\\saemundur\\Desktop\\Crow\\public\\assets\\tilesets\\level1_tiles.png';
    const outputPath = 'C:\\Users\\saemundur\\Desktop\\Crow\\public\\assets\\tilesets\\forest_tiles.png';

    console.log('Creating 128×128 tileset from 32×64 source...');

    // Load the 2-tile source (32×64, tiles stacked vertically)
    const sourceImage = sharp(inputPath);
    const metadata = await sourceImage.metadata();
    console.log(`Source: ${metadata.width}×${metadata.height}`);

    // Extract individual tiles
    const tile1 = await sharp(inputPath)
        .extract({ left: 0, top: 0, width: 32, height: 32 })
        .toBuffer();

    const tile2 = await sharp(inputPath)
        .extract({ left: 0, top: 32, width: 32, height: 32 })
        .toBuffer();

    // Create 4×4 grid by repeating tiles
    // Row 1: tile1, tile1, tile1, tile1 (grass surface)
    // Row 2: tile2, tile2, tile2, tile2 (dirt)
    // Row 3: tile1, tile1, tile1, tile1
    // Row 4: tile2, tile2, tile2, tile2
    const composites = [];

    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
            const tile = (row % 2 === 0) ? tile1 : tile2; // Alternate rows
            composites.push({
                input: tile,
                left: col * 32,
                top: row * 32
            });
        }
    }

    await sharp({
        create: {
            width: 128,
            height: 128,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
    })
    .composite(composites)
    .png()
    .toFile(outputPath);

    console.log(`✓ Created ${outputPath} (128×128, 4×4 grid)`);
    console.log('  Tiles 1-4: grass (top3)');
    console.log('  Tiles 5-8: dirt (bottom2)');
    console.log('  Tiles 9-12: grass (top3)');
    console.log('  Tiles 13-16: dirt (bottom2)');
}

createRevertedTileset()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('ERROR:', err.message);
        process.exit(1);
    });
