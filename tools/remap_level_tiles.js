/**
 * Level Tile Remapper
 *
 * Updates level JSON files to use ONLY 2 tiles: top3 and bottom2.
 * This creates a clean, uniform look without weird mixing.
 *
 * OLD TILESET (8 tiles, 4×2):          NEW TILESET (2 tiles, 1×2):
 * ┌────┬────┬────┬────┐               ┌────┐
 * │ 1  │ 2  │ 3  │ 4  │  (top)        │ 1  │  ← top3 only
 * ├────┼────┼────┼────┤               ├────┤
 * │ 5  │ 6  │ 7  │ 8  │  (bottom)     │ 2  │  ← bottom2 only
 * └────┴────┴────┴────┘               └────┘
 *
 * Tile ID Mapping:
 * - 1 (top1)    → 1 (top3)     ⚠ ALL top tiles use top3 now
 * - 2 (top2)    → 1 (top3)     ⚠ ALL top tiles use top3 now
 * - 3 (top3)    → 1 (top3)     ✓ the chosen top tile
 * - 4 (top4)    → 1 (top3)     ⚠ ALL top tiles use top3 now
 * - 5 (bottom1) → 2 (bottom2)  ⚠ ALL bottom tiles use bottom2 now
 * - 6 (bottom2) → 2 (bottom2)  ✓ the chosen bottom tile
 * - 7 (bottom3) → 2 (bottom2)  ⚠ ALL bottom tiles use bottom2 now
 * - 8 (bottom4) → 2 (bottom2)  ⚠ ALL bottom tiles use bottom2 now
 *
 * Usage: node tools/remap_level_tiles.js
 */

const fs = require('fs');
const path = require('path');

const TILE_MAPPING = {
    1: 1,  // top1 → tile 1 (top3)
    2: 1,  // top2 → tile 1 (top3)
    3: 1,  // top3 → tile 1 (top3) ✓ the chosen one
    4: 1,  // top4 → tile 1 (top3)
    5: 2,  // bottom1 → tile 2 (bottom2)
    6: 2,  // bottom2 → tile 2 (bottom2) ✓ the chosen one
    7: 2,  // bottom3 → tile 2 (bottom2)
    8: 2   // bottom4 → tile 2 (bottom2)
};

const LEVELS_TO_UPDATE = [
    'C:\\Users\\saemundur\\Desktop\\Crow\\public\\data\\levels\\compiled\\level_01_forest.json',
    'C:\\Users\\saemundur\\Desktop\\Crow\\public\\data\\levels\\compiled\\level_02_cave.json'
];

async function remapLevelTiles() {
    console.log('\n' + '='.repeat(70));
    console.log('LEVEL TILE REMAPPER - MINIMAL 2-TILE VERSION');
    console.log('='.repeat(70) + '\n');
    console.log('Remapping ALL tiles to use ONLY top3 and bottom2...');
    console.log('This creates a clean, uniform look without weird mixing.\n');

    for (const levelPath of LEVELS_TO_UPDATE) {
        if (!fs.existsSync(levelPath)) {
            console.log(`⚠ Skipping ${path.basename(levelPath)} (file not found)`);
            continue;
        }

        console.log(`Processing: ${path.basename(levelPath)}`);

        // Read level JSON
        const levelData = JSON.parse(fs.readFileSync(levelPath, 'utf8'));

        // Track statistics
        let tilesRemapped = 0;
        const remapCounts = {};

        // Remap tile IDs in all layers
        for (const layer of levelData.layers) {
            if (layer.type === 'tilelayer' && layer.data) {
                layer.data = layer.data.map(tileId => {
                    if (tileId === 0) return 0;  // Skip empty tiles

                    const oldId = tileId;
                    const newId = TILE_MAPPING[tileId];

                    if (newId !== undefined && newId !== oldId) {
                        tilesRemapped++;
                        remapCounts[`${oldId}→${newId}`] = (remapCounts[`${oldId}→${newId}`] || 0) + 1;
                    }

                    return newId !== undefined ? newId : tileId;
                });
            }
        }

        // Update tileset metadata
        for (const tileset of levelData.tilesets) {
            if (tileset.name === 'level1_tiles') {
                tileset.tilecount = 2;     // Was 8, now just 2!
                tileset.columns = 1;       // Was 4, now just 1 column
                tileset.imagewidth = 32;   // Was 128, now 32 (1 × 32)
                tileset.imageheight = 64;  // Unchanged (2 × 32)
                console.log(`  ✓ Updated tileset metadata: tilecount=2, columns=1, imagewidth=32`);
            }
        }

        // Write updated level JSON
        fs.writeFileSync(levelPath, JSON.stringify(levelData, null, 2), 'utf8');

        console.log(`  ✓ Remapped ${tilesRemapped} tiles`);
        if (Object.keys(remapCounts).length > 0) {
            console.log(`  Breakdown:`);
            for (const [mapping, count] of Object.entries(remapCounts)) {
                console.log(`    - Tile ${mapping}: ${count} occurrences`);
            }
        }
        console.log('');
    }

    console.log('─'.repeat(70));
    console.log('✓ Tile remapping complete!');
    console.log('─'.repeat(70));
    console.log('All ground tiles now use top3, all dirt tiles use bottom2.');
    console.log('Clean, uniform look achieved - no more weird mixing!');
    console.log('\nNEXT: Test your levels in-game (npm run dev)\n');
    console.log('='.repeat(70) + '\n');
}

remapLevelTiles()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('\nERROR:', err.message);
        console.error(err.stack);
        process.exit(1);
    });
