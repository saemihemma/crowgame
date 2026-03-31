#!/usr/bin/env node
/**
 * Audio Processing Script for Crow Platformer
 *
 * Converts WAV/OGG audio files to MP3 and renames them to match audio_manifest.json
 *
 * Requirements:
 * - FFmpeg installed and in PATH
 * - Asset packs downloaded and extracted to downloaded_assets/
 *
 * Usage:
 *   node tools/process_audio.js
 *
 * Source Asset Packs:
 * - SFX: "512 Sound Effects (8-bit style)" by Juhani Junkala (CC0)
 *   https://opengameart.org/content/512-sound-effects-8-bit-style
 * - Music: "Platformer Game Music Pack" by CodeManu (CC-BY 3.0)
 *   https://opengameart.org/content/platformer-game-music-pack
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

// Mapping from source audio files to target filenames
const SFX_MAP = {
  'sfx_movement_jump1.wav': 'jump.mp3',
  'sfx_movement_footsteps1a.wav': 'land.mp3',
  'sfx_wpn_laser1.wav': 'laser.mp3',
  'sfx_coin_double1.wav': 'coin.mp3',
  'sfx_sounds_impact1.wav': 'hit.mp3',
  'sfx_deathscream_alien1.wav': 'death.mp3',
  'sfx_sounds_damage3.wav': 'damage.mp3',
  'sfx_deathscream_human1.wav': 'crow_death.mp3',
  'sfx_sounds_powerup1.wav': 'door.mp3',
  'sfx_sounds_fanfare1.wav': 'fanfare.mp3',
  'sfx_sounds_powerup2.wav': 'correct.mp3',
  'sfx_sounds_error2.wav': 'wrong.mp3',
  'sfx_menu_select1.wav': 'click.mp3',
  'sfx_coin_single2.wav': 'xp.mp3',
  'sfx_sounds_fanfare3.wav': 'levelup.mp3'
};

const MUSIC_MAP = {
  'menu_music.ogg': 'menu.mp3',
  'level_1.ogg': 'forest.mp3',
  'level_2.ogg': 'cave.mp3'
};

// Directories
const SOURCE_SFX_DIR = path.join(__dirname, '..', 'downloaded_assets', 'sfx_pack');
const SOURCE_MUSIC_DIR = path.join(__dirname, '..', 'downloaded_assets', 'music_pack');
const TARGET_SFX_DIR = path.join(__dirname, '..', 'public', 'assets', 'audio', 'sfx');
const TARGET_MUSIC_DIR = path.join(__dirname, '..', 'public', 'assets', 'audio', 'music');

let successCount = 0;
let failCount = 0;
let skipCount = 0;

/**
 * Check if FFmpeg is installed
 */
function checkFFmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Convert and copy audio file
 */
function convertAndCopy(sourceFile, targetFile, label) {
  console.log(`${colors.cyan}Converting:${colors.reset} ${label}`);
  console.log(`  ${colors.gray}${path.basename(sourceFile)} → ${path.basename(targetFile)}${colors.reset}`);

  try {
    // Check if source file exists
    if (!fs.existsSync(sourceFile)) {
      console.log(`  ${colors.yellow}⚠ Source not found, skipping${colors.reset}\n`);
      skipCount++;
      return;
    }

    // Create target directory if it doesn't exist
    const targetDir = path.dirname(targetFile);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Convert using FFmpeg
    execSync(
      `ffmpeg -i "${sourceFile}" -codec:a libmp3lame -b:a 128k -y "${targetFile}"`,
      { stdio: 'ignore' }
    );

    // Get file size
    const stats = fs.statSync(targetFile);
    const sizeKB = (stats.size / 1024).toFixed(2);

    console.log(`  ${colors.green}✓ Success${colors.reset} (${sizeKB} KB)\n`);
    successCount++;
  } catch (error) {
    console.log(`  ${colors.red}✗ Failed: ${error.message}${colors.reset}\n`);
    failCount++;
  }
}

/**
 * Main processing function
 */
function main() {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.cyan}Crow Platformer - Audio Processing Script${colors.reset}`);
  console.log('='.repeat(60) + '\n');

  // Check FFmpeg
  console.log('Checking dependencies...');
  if (!checkFFmpeg()) {
    console.log(`${colors.red}✗ FFmpeg not found!${colors.reset}`);
    console.log('Please install FFmpeg: https://ffmpeg.org/download.html\n');
    process.exit(1);
  }
  console.log(`${colors.green}✓ FFmpeg is installed${colors.reset}\n`);

  // Check source directories
  console.log('Checking source directories...');
  const sfxExists = fs.existsSync(SOURCE_SFX_DIR);
  const musicExists = fs.existsSync(SOURCE_MUSIC_DIR);

  if (!sfxExists && !musicExists) {
    console.log(`${colors.red}✗ No asset directories found!${colors.reset}`);
    console.log('\nPlease download and extract asset packs to:');
    console.log(`  - ${SOURCE_SFX_DIR}`);
    console.log(`  - ${SOURCE_MUSIC_DIR}`);
    console.log('\nSee ASSET_SPECS.md for download instructions.\n');
    process.exit(1);
  }

  if (sfxExists) {
    console.log(`${colors.green}✓ SFX directory found${colors.reset}`);
  } else {
    console.log(`${colors.yellow}⚠ SFX directory not found${colors.reset}`);
  }

  if (musicExists) {
    console.log(`${colors.green}✓ Music directory found${colors.reset}`);
  } else {
    console.log(`${colors.yellow}⚠ Music directory not found${colors.reset}`);
  }

  console.log('');

  // Process SFX
  if (sfxExists) {
    console.log('='.repeat(60));
    console.log('Processing Sound Effects (15 files)...');
    console.log('='.repeat(60) + '\n');

    let sfxIndex = 1;
    for (const [source, target] of Object.entries(SFX_MAP)) {
      const sourcePath = path.join(SOURCE_SFX_DIR, source);
      const targetPath = path.join(TARGET_SFX_DIR, target);
      convertAndCopy(sourcePath, targetPath, `[${sfxIndex}/15] ${target.replace('.mp3', '')}`);
      sfxIndex++;
    }
  }

  // Process Music
  if (musicExists) {
    console.log('='.repeat(60));
    console.log('Processing Music Tracks (3 files)...');
    console.log('='.repeat(60) + '\n');

    let musicIndex = 1;
    for (const [source, target] of Object.entries(MUSIC_MAP)) {
      const sourcePath = path.join(SOURCE_MUSIC_DIR, source);
      const targetPath = path.join(TARGET_MUSIC_DIR, target);
      convertAndCopy(sourcePath, targetPath, `[${musicIndex}/3] ${target.replace('.mp3', '')}`);
      musicIndex++;
    }
  }

  // Summary
  console.log('='.repeat(60));
  console.log('Processing Complete!');
  console.log('='.repeat(60));
  console.log(`${colors.green}✓ Success: ${successCount} files${colors.reset}`);
  if (skipCount > 0) {
    console.log(`${colors.yellow}⚠ Skipped: ${skipCount} files (source not found)${colors.reset}`);
  }
  if (failCount > 0) {
    console.log(`${colors.red}✗ Failed: ${failCount} files${colors.reset}`);
  }
  console.log('');

  if (successCount > 0) {
    console.log(`${colors.cyan}Next steps:${colors.reset}`);
    console.log('1. Run: npm run validate:assets');
    console.log('2. Start dev server: npm run dev');
    console.log('3. Test audio in the game');
    console.log('');
  }

  // Exit with error if any failures
  if (failCount > 0) {
    process.exit(1);
  }
}

// Run the script
main();
