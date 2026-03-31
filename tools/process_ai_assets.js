#!/usr/bin/env node
/**
 * AI Asset Processor for Crow Platformer
 *
 * Processes AI-generated sprites with inconsistent dimensions:
 * - Auto-crops to remove transparency padding
 * - Resizes to exact target dimensions
 * - Combines individual frames into sprite sheets
 * - Extracts frames from sprite sheets
 * - Pixel-perfect scaling for crisp pixel art
 *
 * Usage:
 *   node tools/process_ai_assets.js --input path/to/image.png --output path/to/output.png --frames 4 --size 32x32 --crop
 *   npm run ai:process -- --input ai_assets/collectibles/coin/coin_raw.png --output ai_assets/processed/coin_sheet_fixed.png --frames 4 --size 32x32 --layout horizontal --crop
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { glob } = require('fast-glob');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

class AIAssetProcessor {
  /**
   * Find bounding box of non-transparent pixels
   */
  findContentBounds(imageData, width, height) {
    let minX = width, minY = height, maxX = 0, maxY = 0;
    let hasContent = false;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const alpha = imageData[idx + 3];

        if (alpha > 10) { // Threshold for transparency
          hasContent = true;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    if (!hasContent) {
      return { left: 0, top: 0, width, height };
    }

    return {
      left: minX,
      top: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    };
  }

  /**
   * Auto-crop image to remove transparent padding
   */
  async autoCrop(inputBuffer, padding = 0) {
    const image = sharp(inputBuffer);
    const metadata = await image.metadata();
    const { width, height } = metadata;

    // Get raw pixel data
    const { data } = await image
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Find content bounds
    const bounds = this.findContentBounds(data, width, height);

    // Apply padding
    const paddedBounds = {
      left: Math.max(0, bounds.left - padding),
      top: Math.max(0, bounds.top - padding),
      width: Math.min(width - bounds.left, bounds.width + padding * 2),
      height: Math.min(height - bounds.top, bounds.height + padding * 2)
    };

    // Crop to bounds
    return image.extract(paddedBounds);
  }

  /**
   * Resize image to exact dimensions using pixel-perfect algorithm
   */
  async resizeImage(imageBuffer, targetWidth, targetHeight, algorithm = 'nearest') {
    return sharp(imageBuffer)
      .resize(targetWidth, targetHeight, {
        kernel: algorithm, // 'nearest' for pixel art, 'lanczos3' for smooth
        fit: 'fill' // Force exact dimensions
      })
      .png()
      .toBuffer();
  }

  /**
   * Combine multiple frame buffers into a sprite sheet
   */
  async combineFrames(frameBuffers, frameWidth, frameHeight, layout = 'horizontal') {
    const frameCount = frameBuffers.length;
    const sheetWidth = layout === 'horizontal' ? frameWidth * frameCount : frameWidth;
    const sheetHeight = layout === 'horizontal' ? frameHeight : frameHeight * frameCount;

    // Create composites array
    const composites = frameBuffers.map((buffer, i) => ({
      input: buffer,
      left: layout === 'horizontal' ? i * frameWidth : 0,
      top: layout === 'horizontal' ? 0 : i * frameHeight
    }));

    // Create transparent background
    const sheet = sharp({
      create: {
        width: sheetWidth,
        height: sheetHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    });

    return sheet.composite(composites).png().toBuffer();
  }

  /**
   * Extract individual frames from a sprite sheet
   */
  async extractFrames(sheetPath, frameWidth, frameHeight, frameCount, layout = 'horizontal') {
    const image = sharp(sheetPath);
    const frameBuffers = [];

    for (let i = 0; i < frameCount; i++) {
      const left = layout === 'horizontal' ? i * frameWidth : 0;
      const top = layout === 'horizontal' ? 0 : i * frameHeight;

      const frameBuffer = await image
        .clone()
        .extract({ left, top, width: frameWidth, height: frameHeight })
        .png()
        .toBuffer();

      frameBuffers.push(frameBuffer);
    }

    return frameBuffers;
  }

  /**
   * Process a single sprite or sprite sheet
   */
  async processSingle(options) {
    const {
      input,
      output,
      frames = 1,
      size,
      layout = 'horizontal',
      crop = false,
      padding = 0,
      algorithm = 'nearest'
    } = options;

    console.log(`${colors.cyan}Processing: ${path.basename(input)}${colors.reset}`);

    // Parse size
    const [targetWidth, targetHeight] = size.split('x').map(Number);

    if (!targetWidth || !targetHeight) {
      throw new Error('Invalid size format. Use WxH (e.g., 32x32)');
    }

    // Read input
    if (!fs.existsSync(input)) {
      throw new Error(`Input file not found: ${input}`);
    }

    const inputBuffer = fs.readFileSync(input);

    // If frames > 1, assume input is a sprite sheet that needs to be re-processed
    let processedFrames = [];

    if (frames > 1) {
      // Extract frames first
      console.log(`  ${colors.gray}Extracting ${frames} frames...${colors.reset}`);
      const extractedFrames = await this.extractFrames(input, targetWidth, targetHeight, frames, layout);

      // Process each frame
      for (let i = 0; i < extractedFrames.length; i++) {
        let frameBuffer = extractedFrames[i];

        // Auto-crop if enabled
        if (crop) {
          console.log(`  ${colors.gray}Cropping frame ${i + 1}/${frames}...${colors.reset}`);
          const croppedImage = await this.autoCrop(frameBuffer, padding);
          frameBuffer = await croppedImage.toBuffer();
        }

        // Resize to target dimensions
        console.log(`  ${colors.gray}Resizing frame ${i + 1}/${frames} to ${targetWidth}x${targetHeight}...${colors.reset}`);
        const resizedBuffer = await this.resizeImage(frameBuffer, targetWidth, targetHeight, algorithm);
        processedFrames.push(resizedBuffer);
      }

      // Combine back into sprite sheet
      console.log(`  ${colors.gray}Combining ${frames} frames into sprite sheet...${colors.reset}`);
      const finalSheet = await this.combineFrames(processedFrames, targetWidth, targetHeight, layout);

      // Ensure output directory exists
      const outputDir = path.dirname(output);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Write output
      fs.writeFileSync(output, finalSheet);
    } else {
      // Single image processing
      let processedBuffer = inputBuffer;

      // Auto-crop if enabled
      if (crop) {
        console.log(`  ${colors.gray}Cropping image...${colors.reset}`);
        const croppedImage = await this.autoCrop(processedBuffer, padding);
        processedBuffer = await croppedImage.toBuffer();
      }

      // Resize to target dimensions
      console.log(`  ${colors.gray}Resizing to ${targetWidth}x${targetHeight}...${colors.reset}`);
      processedBuffer = await this.resizeImage(processedBuffer, targetWidth, targetHeight, algorithm);

      // Ensure output directory exists
      const outputDir = path.dirname(output);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Write output
      fs.writeFileSync(output, processedBuffer);
    }

    // Get file size
    const stats = fs.statSync(output);
    const sizeKB = (stats.size / 1024).toFixed(2);

    console.log(`  ${colors.green}✓ Saved: ${output} (${sizeKB} KB)${colors.reset}`);
    return output;
  }

  /**
   * Process multiple individual frames and combine into sprite sheet
   */
  async processMultiple(options) {
    const {
      inputs,
      output,
      size,
      layout = 'horizontal',
      crop = false,
      padding = 0,
      algorithm = 'nearest'
    } = options;

    console.log(`${colors.cyan}Processing ${inputs.length} frames...${colors.reset}`);

    // Parse size
    const [targetWidth, targetHeight] = size.split('x').map(Number);

    if (!targetWidth || !targetHeight) {
      throw new Error('Invalid size format. Use WxH (e.g., 32x32)');
    }

    // Process each frame
    const processedFrames = [];

    for (let i = 0; i < inputs.length; i++) {
      const inputPath = inputs[i];
      console.log(`  ${colors.gray}[${i + 1}/${inputs.length}] ${path.basename(inputPath)}${colors.reset}`);

      if (!fs.existsSync(inputPath)) {
        console.log(`    ${colors.yellow}⚠ File not found, skipping${colors.reset}`);
        continue;
      }

      let frameBuffer = fs.readFileSync(inputPath);

      // Auto-crop if enabled
      if (crop) {
        console.log(`    ${colors.gray}Cropping...${colors.reset}`);
        const croppedImage = await this.autoCrop(frameBuffer, padding);
        frameBuffer = await croppedImage.toBuffer();
      }

      // Resize to target dimensions
      console.log(`    ${colors.gray}Resizing to ${targetWidth}x${targetHeight}...${colors.reset}`);
      const resizedBuffer = await this.resizeImage(frameBuffer, targetWidth, targetHeight, algorithm);
      processedFrames.push(resizedBuffer);
    }

    if (processedFrames.length === 0) {
      throw new Error('No frames were processed');
    }

    // Combine into sprite sheet
    console.log(`  ${colors.gray}Combining ${processedFrames.length} frames into sprite sheet...${colors.reset}`);
    const finalSheet = await this.combineFrames(processedFrames, targetWidth, targetHeight, layout);

    // Ensure output directory exists
    const outputDir = path.dirname(output);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write output
    fs.writeFileSync(output, finalSheet);

    // Get file size
    const stats = fs.statSync(output);
    const sizeKB = (stats.size / 1024).toFixed(2);

    console.log(`  ${colors.green}✓ Saved: ${output} (${sizeKB} KB)${colors.reset}`);
    return output;
  }

  /**
   * Extract mode: Split sprite sheet into individual frames
   */
  async extractMode(options) {
    const {
      input,
      outputDir,
      frames,
      size,
      layout = 'horizontal'
    } = options;

    console.log(`${colors.cyan}Extracting frames from: ${path.basename(input)}${colors.reset}`);

    // Parse size
    const [frameWidth, frameHeight] = size.split('x').map(Number);

    if (!frameWidth || !frameHeight) {
      throw new Error('Invalid size format. Use WxH (e.g., 64x64)');
    }

    // Extract frames
    const frameBuffers = await this.extractFrames(input, frameWidth, frameHeight, frames, layout);

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save each frame
    const baseName = path.basename(input, path.extname(input));
    const savedPaths = [];

    for (let i = 0; i < frameBuffers.length; i++) {
      const framePath = path.join(outputDir, `${baseName}_frame_${i + 1}.png`);
      fs.writeFileSync(framePath, frameBuffers[i]);
      savedPaths.push(framePath);
      console.log(`  ${colors.green}✓ Frame ${i + 1}/${frames}: ${framePath}${colors.reset}`);
    }

    return savedPaths;
  }
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    mode: 'process', // 'process' or 'extract'
    input: null,
    inputs: [],
    output: null,
    outputDir: null,
    frames: 1,
    size: null,
    layout: 'horizontal',
    crop: false,
    padding: 0,
    algorithm: 'nearest'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--mode':
        options.mode = args[++i];
        break;
      case '--input':
      case '-i':
        options.input = args[++i];
        break;
      case '--inputs':
        // Can be comma-separated list or glob pattern
        options.inputs = args[++i].split(',');
        break;
      case '--output':
      case '-o':
        options.output = args[++i];
        break;
      case '--output-dir':
        options.outputDir = args[++i];
        break;
      case '--frames':
      case '-f':
        options.frames = parseInt(args[++i]);
        break;
      case '--size':
      case '-s':
        options.size = args[++i];
        break;
      case '--layout':
      case '-l':
        options.layout = args[++i];
        break;
      case '--crop':
      case '-c':
        options.crop = true;
        break;
      case '--padding':
      case '-p':
        options.padding = parseInt(args[++i]);
        break;
      case '--algorithm':
      case '-a':
        options.algorithm = args[++i];
        break;
      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
      default:
        break;
    }
  }

  return options;
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
${colors.bright}AI Asset Processor for Crow Platformer${colors.reset}

${colors.cyan}USAGE:${colors.reset}
  npm run ai:process -- [options]

${colors.cyan}MODES:${colors.reset}
  process   Process and combine frames (default)
  extract   Extract frames from sprite sheet

${colors.cyan}OPTIONS:${colors.reset}
  --mode <mode>          Processing mode (process|extract)
  --input, -i <path>     Input file (single sprite sheet)
  --inputs <paths>       Multiple input files (comma-separated)
  --output, -o <path>    Output file path
  --output-dir <path>    Output directory (for extract mode)
  --frames, -f <count>   Number of frames
  --size, -s <WxH>       Target frame size (e.g., 32x32, 64x64)
  --layout, -l <layout>  Layout: horizontal (default) or vertical
  --crop, -c             Enable auto-crop to remove transparency
  --padding, -p <px>     Padding pixels after crop (default: 0)
  --algorithm, -a <alg>  Scaling algorithm: nearest (default), lanczos3, cubic

${colors.cyan}EXAMPLES:${colors.reset}

  ${colors.gray}# Process coin sprite sheet (user's example)${colors.reset}
  npm run ai:process -- --input ai_assets/collectibles/coin/coin_raw.png --output ai_assets/processed/coin_sheet_fixed.png --frames 4 --size 32x32 --crop

  ${colors.gray}# Combine multiple frames into sprite sheet${colors.reset}
  npm run ai:process -- --inputs "ai_assets/characters/crow/frame_*.png" --output ai_assets/characters/crow/crow_sheet_fixed.png --size 64x64 --crop

  ${colors.gray}# Extract frames from sprite sheet${colors.reset}
  npm run ai:process -- --mode extract --input ai_assets/characters/crow/crow_sheet_raw.png --output-dir ai_assets/characters/crow/extracted --frames 6 --size 64x64
`);
}

/**
 * Main execution
 */
async function main() {
  const options = parseArgs();

  // Validate required options
  if (!options.size) {
    console.error(`${colors.red}Error: --size is required${colors.reset}`);
    showHelp();
    process.exit(1);
  }

  const processor = new AIAssetProcessor();

  try {
    if (options.mode === 'extract') {
      // Extract mode
      if (!options.input || !options.outputDir || !options.frames) {
        console.error(`${colors.red}Error: Extract mode requires --input, --output-dir, and --frames${colors.reset}`);
        process.exit(1);
      }

      await processor.extractMode(options);
      console.log(`\n${colors.green}✓ Extraction complete!${colors.reset}`);
    } else {
      // Process mode
      if (options.inputs.length > 0) {
        // Multiple inputs: combine into sprite sheet
        if (!options.output) {
          console.error(`${colors.red}Error: --output is required for multiple inputs${colors.reset}`);
          process.exit(1);
        }

        // Expand glob patterns
        let expandedInputs = [];
        for (const pattern of options.inputs) {
          if (pattern.includes('*')) {
            const matches = await glob(pattern, { onlyFiles: true });
            expandedInputs.push(...matches);
          } else {
            expandedInputs.push(pattern);
          }
        }

        options.inputs = expandedInputs.sort();
        await processor.processMultiple(options);
      } else {
        // Single input
        if (!options.input || !options.output) {
          console.error(`${colors.red}Error: --input and --output are required${colors.reset}`);
          process.exit(1);
        }

        await processor.processSingle(options);
      }

      console.log(`\n${colors.green}✓ Processing complete!${colors.reset}`);
    }
  } catch (error) {
    console.error(`\n${colors.red}✗ Error: ${error.message}${colors.reset}`);
    if (error.stack) {
      console.error(`${colors.gray}${error.stack}${colors.reset}`);
    }
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = AIAssetProcessor;
