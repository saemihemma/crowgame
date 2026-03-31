/**
 * Crow Sprite Cropping Tool
 *
 * Removes bottom padding from crow sprite and positions content at bottom of 64x64 frame.
 * This makes the crow sprite structure match the owl sprite for consistent positioning.
 *
 * Usage: node tools/crop_crow_sprite.js
 */

const sharp = require('sharp');
const path = require('path');

async function cropCrowSprite() {
    const inputPath = 'C:\\Users\\saemundur\\Desktop\\Crow\\public\\assets\\sprites\\characters\\crow2\\crow3\\sprite-64px-9-frames\\sprite-64px-9-frames\\frame_000.png';
    const outputPath = 'C:\\Users\\saemundur\\Desktop\\Crow\\public\\assets\\sprites\\characters\\crow2\\crow3\\sprite-64px-9-frames\\sprite-64px-9-frames\\crow-64px-fixed.png';

    console.log('\\n' + '='.repeat(70));
    console.log('CROW SPRITE CROPPING TOOL');
    console.log('='.repeat(70) + '\\n');

    console.log(`Input: ${path.basename(inputPath)}`);

    // Load the image
    const image = sharp(inputPath);
    const metadata = await image.metadata();
    console.log(`Original size: ${metadata.width}x${metadata.height}`);

    // Get raw pixel data to find content bounds
    const rawData = await image.raw().toBuffer({ resolveWithObject: true });
    const bounds = findContentBounds(rawData.data, metadata.width, metadata.height, rawData.info.channels);

    console.log(`Content bounds: x=${bounds.left}, y=${bounds.top}, w=${bounds.width}, h=${bounds.height}`);
    console.log(`Bottom padding: ${metadata.height - bounds.bottom - 1}px\\n`);

    // Extract the crow content
    let contentImage = image.extract({
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height
    });

    // Create new 64x64 canvas with crow positioned at BOTTOM (no padding)
    const TARGET_SIZE = 64;

    // Scale content to fit if needed (keep aspect ratio)
    let finalWidth = bounds.width;
    let finalHeight = bounds.height;

    if (bounds.width > TARGET_SIZE || bounds.height > TARGET_SIZE) {
        const scale = Math.min(TARGET_SIZE / bounds.width, TARGET_SIZE / bounds.height);
        finalWidth = Math.floor(bounds.width * scale);
        finalHeight = Math.floor(bounds.height * scale);
        console.log(`Scaling content: ${bounds.width}x${bounds.height} → ${finalWidth}x${finalHeight}`);
        contentImage = contentImage.resize(finalWidth, finalHeight, { fit: 'contain' });
    }

    const contentBuffer = await contentImage.png().toBuffer();

    const contentX = Math.floor((TARGET_SIZE - finalWidth) / 2);
    const contentY = TARGET_SIZE - finalHeight; // Align to bottom

    console.log('Creating fixed sprite:');
    console.log(`  Canvas: ${TARGET_SIZE}x${TARGET_SIZE}`);
    console.log(`  Content position: (${contentX}, ${contentY})`);
    console.log(`  Content size: ${finalWidth}x${finalHeight}`);
    console.log(`  Content will touch bottom edge\\n`);

    const fixedSprite = await sharp({
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
    .toFile(outputPath);

    console.log(`✓ Saved fixed sprite: ${path.basename(outputPath)}`);
    console.log(`  Size: ${fixedSprite.width}x${fixedSprite.height}`);
    console.log(`\\n${'─'.repeat(70)}`);
    console.log('NEXT STEPS:');
    console.log('─'.repeat(70) + '\\n');
    console.log('1. Update BootScene.ts line 70:');
    console.log('   this.load.image(\'crow\', \'...sprite-64px-9-frames/crow-64px-fixed.png\');\n');
    console.log('2. Test in game - crow should sit on green grass like owl\\n');
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

cropCrowSprite()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('ERROR:', err.message);
        console.error(err.stack);
        process.exit(1);
    });
