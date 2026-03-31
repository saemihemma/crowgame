/**
 * Spike Hazard Spritesheet Generator
 *
 * Combines 4 spike variants (spike1-4.png) into a variable-width spritesheet.
 * Creates 16 sprites total: 4 spike styles × 4 widths (32, 64, 96, 128 pixels).
 *
 * Input:  spike1-4.png (500×500 each, transparent top+bottom)
 * Output: spike_hazards.png (320×128, 4×4 grid with variable widths)
 *
 * IMPORTANT: Preserves dual transparency (top AND bottom) for proper alignment.
 *
 * Usage: node tools/create_spike_hazards.js
 */

const sharp = require('sharp');
const path = require('path');

const SPIKE_HEIGHT = 32;
const WIDTHS = [32, 64, 96, 128];
const INPUT_DIR = 'C:\\Users\\saemundur\\Desktop\\Crow\\public\\assets\\tilesets\\level1';
const OUTPUT_PATH = 'C:\\Users\\saemundur\\Desktop\\Crow\\public\\assets\\tilesets\\spike_hazards.png';

async function createSpikeHazards() {
    console.log('\n' + '='.repeat(70));
    console.log('SPIKE HAZARD SPRITESHEET GENERATOR');
    console.log('='.repeat(70) + '\n');

    console.log(`Target sprite height: ${SPIKE_HEIGHT}px`);
    console.log(`Width variants: ${WIDTHS.join(', ')} px`);
    console.log(`Output spritesheet: 320×128 (4 rows × 4 columns)\n`);

    const spikeVariants = ['spike1.png', 'spike2.png', 'spike3.png', 'spike4.png'];
    const allSprites = [];

    // Process all 4 spike variants
    for (let variantIdx = 0; variantIdx < spikeVariants.length; variantIdx++) {
        const inputPath = path.join(INPUT_DIR, spikeVariants[variantIdx]);
        console.log(`Processing ${spikeVariants[variantIdx]}...`);

        try {
            const image = sharp(inputPath);
            const metadata = await image.metadata();
            console.log(`  Source: ${metadata.width}×${metadata.height}`);

            // Load and trim transparent edge padding (threshold: 10 alpha)
            const trimmed = await image
                .trim({ threshold: 10 })
                .toBuffer();

            const trimmedMeta = await sharp(trimmed).metadata();
            console.log(`  Trimmed to: ${trimmedMeta.width}×${trimmedMeta.height} (removed padding)`);

            // Create 4 width variants for this spike style
            for (const width of WIDTHS) {
                const scaled = await sharp(trimmed)
                    .resize(width, SPIKE_HEIGHT, {
                        fit: 'contain', // Preserve aspect ratio, add transparent padding
                        background: { r: 0, g: 0, b: 0, alpha: 0 }
                    })
                    .png()
                    .toBuffer();

                allSprites.push({
                    buffer: scaled,
                    width: width,
                    height: SPIKE_HEIGHT,
                    variant: variantIdx + 1
                });

                console.log(`    ✓ Created ${width}×${SPIKE_HEIGHT} variant`);
            }
            console.log('');
        } catch (err) {
            console.error(`  ERROR processing ${spikeVariants[variantIdx]}:`, err.message);
            process.exit(1);
        }
    }

    // Composite into final spritesheet
    console.log('─'.repeat(70));
    console.log('Creating spritesheet...\n');

    const composites = [];

    // Build composite array with variable-width layout
    // Row Y positions: 0, 32, 64, 96
    // Column X positions: 0, 32, 96, 192 (cumulative: 0, 0+32, 32+64, 96+96)
    for (let row = 0; row < 4; row++) {
        let xOffset = 0;
        for (let col = 0; col < 4; col++) {
            const spriteIdx = row * 4 + col;
            composites.push({
                input: allSprites[spriteIdx].buffer,
                left: xOffset,
                top: row * SPIKE_HEIGHT
            });
            xOffset += WIDTHS[col]; // Cumulative X offset
        }
    }

    console.log('Composite layout:');
    console.log(`  Row 1 (spike1): X offsets: 0, 32, 96, 192`);
    console.log(`  Row 2 (spike2): X offsets: 0, 32, 96, 192`);
    console.log(`  Row 3 (spike3): X offsets: 0, 32, 96, 192`);
    console.log(`  Row 4 (spike4): X offsets: 0, 32, 96, 192\n`);

    try {
        await sharp({
            create: {
                width: 320, // Sum: 32 + 64 + 96 + 128 = 320
                height: 128, // 4 rows × 32px
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            }
        })
        .composite(composites)
        .png()
        .toFile(OUTPUT_PATH);

        console.log(`✓ Saved spritesheet: ${path.basename(OUTPUT_PATH)}`);
        console.log(`  Dimensions: 320×128`);
        console.log(`  Sprite count: 16 (4 variants × 4 widths)\n`);
    } catch (err) {
        console.error('ERROR creating spritesheet:', err.message);
        process.exit(1);
    }

    console.log('─'.repeat(70));
    console.log('SPRITESHEET LAYOUT:');
    console.log('─'.repeat(70));
    console.log('┌─────────┬─────────┬─────────┬─────────┐');
    console.log('│  32×32  │  64×32  │  96×32  │ 128×32  │  ← spike1 (variant 1)');
    console.log('├─────────┼─────────┼─────────┼─────────┤');
    console.log('│  32×32  │  64×32  │  96×32  │ 128×32  │  ← spike2 (variant 2)');
    console.log('├─────────┼─────────┼─────────┼─────────┤');
    console.log('│  32×32  │  64×32  │  96×32  │ 128×32  │  ← spike3 (variant 3)');
    console.log('├─────────┼─────────┼─────────┼─────────┤');
    console.log('│  32×32  │  64×32  │  96×32  │ 128×32  │  ← spike4 (variant 4)');
    console.log('└─────────┴─────────┴─────────┴─────────┘\n');

    console.log('─'.repeat(70));
    console.log('FRAME KEYS:');
    console.log('─'.repeat(70));
    console.log('spike_1_32, spike_1_64, spike_1_96, spike_1_128');
    console.log('spike_2_32, spike_2_64, spike_2_96, spike_2_128');
    console.log('spike_3_32, spike_3_64, spike_3_96, spike_3_128');
    console.log('spike_4_32, spike_4_64, spike_4_96, spike_4_128\n');

    console.log('─'.repeat(70));
    console.log('NEXT STEPS:');
    console.log('─'.repeat(70));
    console.log('1. Update BootScene.ts to load spike_hazards.png');
    console.log('2. Add manual frame definitions in BootScene create()');
    console.log('3. Refactor GameScene.spawnHazard() to use sprites');
    console.log('4. Test in-game\n');
    console.log('='.repeat(70) + '\n');
}

createSpikeHazards()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('\nFATAL ERROR:', err.message);
        console.error(err.stack);
        process.exit(1);
    });
