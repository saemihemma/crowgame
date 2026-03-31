/**
 * Sprite Sheet Frame Alignment Analyzer
 *
 * Analyzes a sprite sheet to detect vertical alignment issues between frames.
 * Useful for identifying why sprites appear to "bounce" during animation.
 *
 * Usage: node tools/analyze_sprite_sheet.js
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function analyzeSpriteSheet(imagePath, frameWidth, frameHeight, gridCols, gridRows) {
    console.log(`\n${'='.repeat(70)}`);
    console.log('SPRITE SHEET FRAME ALIGNMENT ANALYZER');
    console.log(`${'='.repeat(70)}\n`);

    console.log(`Analyzing: ${path.basename(imagePath)}`);
    console.log(`Frame size: ${frameWidth}x${frameHeight}`);
    console.log(`Grid: ${gridCols}x${gridRows} (${gridCols * gridRows} frames total)\n`);

    // Load the sprite sheet
    const image = sharp(imagePath);
    const metadata = await image.metadata();
    console.log(`Image dimensions: ${metadata.width}x${metadata.height}`);

    if (metadata.width !== frameWidth * gridCols || metadata.height !== frameHeight * gridRows) {
        console.log(`⚠️  WARNING: Image size doesn't match expected grid!`);
        console.log(`   Expected: ${frameWidth * gridCols}x${frameHeight * gridRows}`);
        console.log(`   Actual: ${metadata.width}x${metadata.height}\n`);
    }

    // Extract and analyze each frame
    const frameAnalysis = [];

    for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
            const frameNum = row * gridCols + col;
            const left = col * frameWidth;
            const top = row * frameHeight;

            // Extract frame
            const frameBuffer = await image
                .clone()
                .extract({ left, top, width: frameWidth, height: frameHeight })
                .raw()
                .toBuffer({ resolveWithObject: true });

            // Find content bounding box (non-transparent pixels)
            const bounds = findContentBounds(
                frameBuffer.data,
                frameWidth,
                frameHeight,
                frameBuffer.info.channels
            );

            frameAnalysis.push({
                frameNum,
                row,
                col,
                bounds
            });
        }
    }

    // Report findings
    console.log(`${'─'.repeat(70)}`);
    console.log('FRAME ANALYSIS:');
    console.log(`${'─'.repeat(70)}\n`);

    const topEdges = frameAnalysis.map(f => f.bounds.top);
    const bottomEdges = frameAnalysis.map(f => f.bounds.bottom);
    const heights = frameAnalysis.map(f => f.bounds.height);

    const minTop = Math.min(...topEdges);
    const maxTop = Math.max(...topEdges);
    const minBottom = Math.min(...bottomEdges);
    const maxBottom = Math.max(...bottomEdges);
    const minHeight = Math.min(...heights);
    const maxHeight = Math.max(...heights);

    console.log(`Content top edge:    ${minTop} to ${maxTop} pixels (variance: ${maxTop - minTop}px)`);
    console.log(`Content bottom edge: ${minBottom} to ${maxBottom} pixels (variance: ${maxBottom - minBottom}px)`);
    console.log(`Content height:      ${minHeight} to ${maxHeight} pixels (variance: ${maxHeight - minHeight}px)\n`);

    // Identify problematic frames
    const topVarianceThreshold = 5; // More than 5px variation is noticeable
    const bottomVarianceThreshold = 5;

    if (maxTop - minTop > topVarianceThreshold) {
        console.log(`❌ ISSUE DETECTED: Top edge varies by ${maxTop - minTop}px`);
        console.log(`   This will cause the sprite to appear to "bounce" up and down.\n`);

        console.log(`Frames sorted by top edge position:`);
        const sorted = [...frameAnalysis].sort((a, b) => a.bounds.top - b.bounds.top);
        sorted.forEach(f => {
            const marker = f.bounds.top === minTop ? '✓ (lowest)' :
                          f.bounds.top === maxTop ? '✗ (highest)' : '';
            console.log(`   Frame ${f.frameNum.toString().padStart(2)}: top=${f.bounds.top.toString().padStart(3)}px, bottom=${f.bounds.bottom.toString().padStart(3)}px ${marker}`);
        });
        console.log();
    } else {
        console.log(`✓ Top edges are well-aligned (variance: ${maxTop - minTop}px)\n`);
    }

    if (maxBottom - minBottom > bottomVarianceThreshold) {
        console.log(`❌ ISSUE DETECTED: Bottom edge varies by ${maxBottom - minBottom}px`);
        console.log(`   This may cause issues with ground alignment.\n`);
    } else {
        console.log(`✓ Bottom edges are well-aligned (variance: ${maxBottom - minBottom}px)\n`);
    }

    // Check for bottom padding
    const avgBottom = bottomEdges.reduce((a, b) => a + b, 0) / bottomEdges.length;
    const bottomPadding = frameHeight - avgBottom;

    console.log(`Average bottom padding: ${bottomPadding.toFixed(1)}px`);
    if (bottomPadding > 10) {
        console.log(`⚠️  WARNING: Significant empty space below content (${bottomPadding.toFixed(1)}px)`);
        console.log(`   This may cause the sprite to appear "floating" above the ground.\n`);
    } else {
        console.log(`✓ Minimal bottom padding\n`);
    }

    // Recommendations
    console.log(`${'─'.repeat(70)}`);
    console.log('RECOMMENDATIONS:');
    console.log(`${'─'.repeat(70)}\n`);

    if (maxTop - minTop > topVarianceThreshold || maxBottom - minBottom > bottomVarianceThreshold) {
        console.log('1. Fix alignment in image editor (GIMP, Aseprite, Photoshop):');
        console.log('   - Open the sprite sheet');
        console.log('   - For each frame, adjust position so content is vertically aligned');
        console.log(`   - Align bottom edges at pixel Y=${maxBottom} (or top edges at Y=${minTop})`);
        console.log('   - Ensure consistent padding on all sides\n');

        console.log('2. Alternative: Use auto-alignment tool (if available):');
        console.log('   - Run: node tools/align_sprite_sheet.js\n');
    } else {
        console.log('✓ No major alignment issues detected!\n');
    }

    console.log(`${'='.repeat(70)}\n`);
}

function findContentBounds(pixelData, width, height, channels) {
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * channels;
            const alpha = channels === 4 ? pixelData[idx + 3] : 255;

            // Consider pixel as "content" if not fully transparent
            if (alpha > 10) {
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
        }
    }

    return {
        top: minY,
        left: minX,
        bottom: maxY,
        right: maxX,
        width: maxX - minX + 1,
        height: maxY - minY + 1
    };
}

// Run analysis
const SPRITE_PATH = 'C:\\Users\\saemundur\\Desktop\\Crow\\public\\assets\\sprites\\characters\\crow2\\crow2\\crow-idle.png';
const FRAME_WIDTH = 298;
const FRAME_HEIGHT = 308;
const GRID_COLS = 6;
const GRID_ROWS = 6;

if (!fs.existsSync(SPRITE_PATH)) {
    console.error(`ERROR: Sprite sheet not found at ${SPRITE_PATH}`);
    process.exit(1);
}

analyzeSpriteSheet(SPRITE_PATH, FRAME_WIDTH, FRAME_HEIGHT, GRID_COLS, GRID_ROWS)
    .then(() => process.exit(0))
    .catch(err => {
        console.error('ERROR:', err.message);
        process.exit(1);
    });
