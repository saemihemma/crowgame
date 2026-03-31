/**
 * Crow Walking Animation Sprite Sheet Cropping Tool
 *
 * Processes 3x3 walking animation sprite sheet (9 frames).
 * Removes bottom padding from each frame and positions content at bottom of 64x64 frame.
 * Creates a new sprite sheet with all frames properly aligned.
 *
 * Usage: node tools/crop_crow_walk_animation.js
 */

const sharp = require('sharp');
const path = require('path');

async function cropWalkAnimation() {
    const inputPath = 'C:\\Users\\saemundur\\Desktop\\Crow\\public\\assets\\sprites\\characters\\crow2\\crow3\\sprite-64px-9.png';
    const outputPath = 'C:\\Users\\saemundur\\Desktop\\Crow\\public\\assets\\sprites\\characters\\crow2\\crow3\\crow-walk-64px-fixed.png';

    console.log('\\n' + '='.repeat(70));
    console.log('CROW WALKING ANIMATION CROPPING TOOL');
    console.log('='.repeat(70) + '\\n');

    console.log(`Input: ${path.basename(inputPath)}`);

    // Load the sprite sheet
    const image = sharp(inputPath);
    const metadata = await image.metadata();
    console.log(`Sprite sheet size: ${metadata.width}x${metadata.height}`);

    // Calculate frame size (3x3 grid)
    const GRID_COLS = 3;
    const GRID_ROWS = 3;
    const frameWidth = Math.floor(metadata.width / GRID_COLS);
    const frameHeight = Math.floor(metadata.height / GRID_ROWS);
    console.log(`Original frame size: ${frameWidth}x${frameHeight}`);
    console.log(`Total frames: ${GRID_COLS * GRID_ROWS}\\n`);

    // Process each frame
    const TARGET_SIZE = 64;
    const processedFrames = [];

    console.log('Processing frames...');

    for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
            const frameNum = row * GRID_COLS + col;
            const left = col * frameWidth;
            const top = row * frameHeight;

            console.log(`  Processing frame ${frameNum} at (${left}, ${top})...`);

            // Extract frame and convert to buffer
            const frameBuffer = await image.clone().extract({
                left,
                top,
                width: frameWidth,
                height: frameHeight
            }).png().toBuffer();

            const frameImage = sharp(frameBuffer);

            // Get raw pixel data to find content bounds
            let rawData;
            try {
                rawData = await frameImage.raw().toBuffer({ resolveWithObject: true });
            } catch (err) {
                console.log(`  Frame ${frameNum}: Error reading frame - ${err.message}`);
                // Create empty 64x64 frame
                const emptyFrame = await sharp({
                    create: {
                        width: TARGET_SIZE,
                        height: TARGET_SIZE,
                        channels: 4,
                        background: { r: 0, g: 0, b: 0, alpha: 0 }
                    }
                })
                .png()
                .toBuffer();
                processedFrames.push(emptyFrame);
                continue;
            }

            const bounds = findContentBounds(
                rawData.data,
                frameWidth,
                frameHeight,
                rawData.info.channels
            );

            console.log(`    Bounds: x=${bounds.left}, y=${bounds.top}, w=${bounds.width}, h=${bounds.height}`);

            // Check if frame has content
            if (bounds.width === 0 || bounds.height === 0 || bounds.width < 0 || bounds.height < 0) {
                console.log(`  Frame ${frameNum}: Empty, skipping`);
                // Create empty 64x64 frame
                const emptyFrame = await sharp({
                    create: {
                        width: TARGET_SIZE,
                        height: TARGET_SIZE,
                        channels: 4,
                        background: { r: 0, g: 0, b: 0, alpha: 0 }
                    }
                })
                .png()
                .toBuffer();
                processedFrames.push(emptyFrame);
                continue;
            }

            // Extract and scale content
            let contentImage = sharp(frameBuffer).extract({
                left: bounds.left,
                top: bounds.top,
                width: bounds.width,
                height: bounds.height
            });

            let finalWidth = bounds.width;
            let finalHeight = bounds.height;

            if (bounds.width > TARGET_SIZE || bounds.height > TARGET_SIZE) {
                const scale = Math.min(TARGET_SIZE / bounds.width, TARGET_SIZE / bounds.height);
                finalWidth = Math.floor(bounds.width * scale);
                finalHeight = Math.floor(bounds.height * scale);
                contentImage = contentImage.resize(finalWidth, finalHeight, { fit: 'contain' });
            }

            const contentBuffer = await contentImage.png().toBuffer();

            // Position at bottom of 64x64 canvas
            const contentX = Math.floor((TARGET_SIZE - finalWidth) / 2);
            const contentY = TARGET_SIZE - finalHeight;

            const fixedFrame = await sharp({
                create: {
                    width: TARGET_SIZE,
                    height: TARGET_SIZE,
                    channels: 4,
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                }
            })
            .composite([{
                input: contentBuffer,
                left: contentX,
                top: contentY
            }])
            .png()
            .toBuffer();

            processedFrames.push(fixedFrame);

            if ((frameNum + 1) % 3 === 0) {
                console.log(`  Processed ${frameNum + 1}/${GRID_COLS * GRID_ROWS} frames`);
            }
        }
    }

    console.log(`\\n✓ All ${processedFrames.length} frames processed\\n`);

    // Combine frames back into 3x3 sprite sheet
    console.log('Creating fixed sprite sheet...');

    const sheetWidth = TARGET_SIZE * GRID_COLS;
    const sheetHeight = TARGET_SIZE * GRID_ROWS;

    const composites = processedFrames.map((buffer, i) => {
        const row = Math.floor(i / GRID_COLS);
        const col = i % GRID_COLS;
        return {
            input: buffer,
            left: col * TARGET_SIZE,
            top: row * TARGET_SIZE
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

    console.log(`✓ Saved fixed walking sprite sheet: ${path.basename(outputPath)}`);
    console.log(`  Size: ${outputSheet.width}x${outputSheet.height}`);
    console.log(`  Frame size: ${TARGET_SIZE}x${TARGET_SIZE}\\n`);

    console.log('─'.repeat(70));
    console.log('NEXT STEPS:');
    console.log('─'.repeat(70) + '\n');
    console.log('1. Update BootScene.ts to load the walking animation:');
    console.log('   this.load.spritesheet(\'crow_walk\', \'...crow-walk-64px-fixed.png\', {');
    console.log('       frameWidth: 64,');
    console.log('       frameHeight: 64');
    console.log('   });\n');
    console.log('2. Create animation in BootScene.ts:');
    console.log('   this.anims.create({');
    console.log('       key: \'crow_walk\',');
    console.log('       frames: this.anims.generateFrameNumbers(\'crow_walk\', { start: 0, end: 8 }),');
    console.log('       frameRate: 12,');
    console.log('       repeat: -1');
    console.log('   });\n');
    console.log('3. Play animation in Player.ts when moving');
    console.log('4. Use sprite.setFlipX(true) when walking left\n');
    console.log('='.repeat(70) + '\\n');
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

cropWalkAnimation()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('ERROR:', err.message);
        console.error(err.stack);
        process.exit(1);
    });
