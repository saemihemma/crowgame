/**
 * Sprite Sheet Auto-Alignment Tool
 *
 * Automatically aligns all frames in a sprite sheet to fix bouncing animations.
 * Aligns content to the bottom of each frame and optionally removes padding.
 *
 * Usage: node tools/align_sprite_sheet.js [--remove-padding]
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function alignSpriteSheet(imagePath, frameWidth, frameHeight, gridCols, gridRows, options = {}) {
    console.log(`\n${'='.repeat(70)}`);
    console.log('SPRITE SHEET AUTO-ALIGNMENT TOOL');
    console.log(`${'='.repeat(70)}\n`);

    console.log(`Input: ${path.basename(imagePath)}`);
    console.log(`Frame size: ${frameWidth}x${frameHeight}`);
    console.log(`Grid: ${gridCols}x${gridRows} (${gridCols * gridRows} frames total)`);
    console.log(`Options: ${options.removePadding ? 'Remove bottom padding' : 'Keep frame size'}\n`);

    // Load the sprite sheet
    const image = sharp(imagePath);
    const metadata = await image.metadata();

    // Extract and process each frame
    const processedFrames = [];
    let maxContentHeight = 0;
    let maxContentWidth = 0;

    console.log('Processing frames...');

    for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
            const frameNum = row * gridCols + col;
            const left = col * frameWidth;
            const top = row * frameHeight;

            // Extract frame
            const frameBuffer = await image
                .clone()
                .extract({ left, top, width: frameWidth, height: frameHeight })
                .toBuffer();

            // Find content bounding box
            const frameImage = sharp(frameBuffer);
            const frameRaw = await frameImage.raw().toBuffer({ resolveWithObject: true });
            const bounds = findContentBounds(
                frameRaw.data,
                frameWidth,
                frameHeight,
                frameRaw.info.channels
            );

            maxContentHeight = Math.max(maxContentHeight, bounds.height);
            maxContentWidth = Math.max(maxContentWidth, bounds.width);

            // Extract just the content
            const content = await frameImage
                .extract({
                    left: bounds.left,
                    top: bounds.top,
                    width: bounds.width,
                    height: bounds.height
                })
                .png()
                .toBuffer();

            processedFrames.push({
                frameNum,
                content,
                contentWidth: bounds.width,
                contentHeight: bounds.height,
                originalBounds: bounds
            });

            if ((frameNum + 1) % 6 === 0) {
                process.stdout.write(`  Processed ${frameNum + 1}/${gridCols * gridRows} frames\r`);
            }
        }
    }

    console.log(`  Processed ${gridCols * gridRows}/${gridCols * gridRows} frames ✓\n`);

    // Determine target frame size
    let targetFrameWidth = frameWidth;
    let targetFrameHeight = frameHeight;

    if (options.removePadding) {
        // Use max content size + small padding
        const padding = 4;
        targetFrameWidth = maxContentWidth + padding * 2;
        targetFrameHeight = maxContentHeight + padding * 2;
        console.log(`Target frame size: ${targetFrameWidth}x${targetFrameHeight} (content: ${maxContentWidth}x${maxContentHeight})`);
    } else {
        console.log(`Target frame size: ${targetFrameWidth}x${targetFrameHeight} (original size)`);
    }

    // Create aligned frames
    console.log('Creating aligned frames...');
    const alignedFrames = [];

    for (const frame of processedFrames) {
        // Position content at bottom-center of frame
        const offsetX = Math.floor((targetFrameWidth - frame.contentWidth) / 2);
        const offsetY = targetFrameHeight - frame.contentHeight; // Align to bottom

        // Create frame with transparent background
        const alignedFrame = await sharp({
            create: {
                width: targetFrameWidth,
                height: targetFrameHeight,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            }
        })
        .composite([{
            input: frame.content,
            left: offsetX,
            top: offsetY
        }])
        .png()
        .toBuffer();

        alignedFrames.push(alignedFrame);

        if ((frame.frameNum + 1) % 6 === 0) {
            process.stdout.write(`  Created ${frame.frameNum + 1}/${gridCols * gridRows} aligned frames\r`);
        }
    }

    console.log(`  Created ${gridCols * gridRows}/${gridCols * gridRows} aligned frames ✓\n`);

    // Combine frames into new sprite sheet
    console.log('Combining into sprite sheet...');
    const sheetWidth = targetFrameWidth * gridCols;
    const sheetHeight = targetFrameHeight * gridRows;

    const composites = alignedFrames.map((buffer, i) => {
        const row = Math.floor(i / gridCols);
        const col = i % gridCols;
        return {
            input: buffer,
            left: col * targetFrameWidth,
            top: row * targetFrameHeight
        };
    });

    const outputSheet = sharp({
        create: {
            width: sheetWidth,
            height: sheetHeight,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
    })
    .composite(composites)
    .png();

    // Save output
    const outputPath = imagePath.replace(/\.png$/, '_aligned.png');
    await outputSheet.toFile(outputPath);

    console.log(`✓ Saved aligned sprite sheet: ${path.basename(outputPath)}`);
    console.log(`  Dimensions: ${sheetWidth}x${sheetHeight}`);
    console.log(`  Frame size: ${targetFrameWidth}x${targetFrameHeight}\n`);

    // Update instructions
    console.log(`${'─'.repeat(70)}`);
    console.log('NEXT STEPS:');
    console.log(`${'─'.repeat(70)}\n`);
    console.log('1. Review the aligned sprite sheet:');
    console.log(`   ${outputPath}\n`);
    console.log('2. If it looks correct, replace the original:');
    console.log(`   - Backup: ${imagePath}.backup`);
    console.log(`   - Replace: ${imagePath}\n`);

    if (targetFrameWidth !== frameWidth || targetFrameHeight !== frameHeight) {
        console.log('3. Update BootScene.ts sprite loading:');
        console.log(`   frameWidth: ${frameWidth} → ${targetFrameWidth}`);
        console.log(`   frameHeight: ${frameHeight} → ${targetFrameHeight}\n`);
    } else {
        console.log('3. No code changes needed (frame size unchanged)\n');
    }

    console.log('4. Test in game:');
    console.log('   - npm run dev');
    console.log('   - Check for bouncing: should be completely static when idle');
    console.log('   - Check ground level: feet should touch ground with no gap\n');

    console.log(`${'='.repeat(70)}\n`);

    return {
        outputPath,
        originalSize: { width: frameWidth, height: frameHeight },
        newSize: { width: targetFrameWidth, height: targetFrameHeight },
        sheetSize: { width: sheetWidth, height: sheetHeight }
    };
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

// Parse command line arguments
const args = process.argv.slice(2);
const removePadding = args.includes('--remove-padding');

// Configuration
const SPRITE_PATH = 'C:\\Users\\saemundur\\Desktop\\Crow\\public\\assets\\sprites\\characters\\crow2\\crow2\\crow-idle.png';
const FRAME_WIDTH = 298;
const FRAME_HEIGHT = 308;
const GRID_COLS = 6;
const GRID_ROWS = 6;

if (!fs.existsSync(SPRITE_PATH)) {
    console.error(`ERROR: Sprite sheet not found at ${SPRITE_PATH}`);
    process.exit(1);
}

alignSpriteSheet(SPRITE_PATH, FRAME_WIDTH, FRAME_HEIGHT, GRID_COLS, GRID_ROWS, { removePadding })
    .then(() => process.exit(0))
    .catch(err => {
        console.error('ERROR:', err.message);
        console.error(err.stack);
        process.exit(1);
    });
