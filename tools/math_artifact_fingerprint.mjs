import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { relative, resolve } from 'path';
import fg from 'fast-glob';

const MATH_BROWSER_SMOKE_FINGERPRINT_PATTERNS = [
  'src/main.ts',
  'src/scenes/GameScene.ts',
  'src/scenes/MathChallengeScene.ts',
  'src/entities/npc/**/*.ts',
  'src/math/**/*.ts',
  'src/systems/LearnerStateManager.ts',
  'src/utils/Types.ts',
  'public/data/math/**/*.json',
  'public/data/npcs/npc_registry.json',
  'public/data/levels/specs/level_01_forest.spec.json',
  'public/data/levels/compiled/level_01_forest.json',
  'tools/math_browser_smoke.mjs'
];

export function computeMathBrowserSmokeFingerprint(rootDir) {
  const absoluteRoot = resolve(rootDir);
  const files = fg.sync(MATH_BROWSER_SMOKE_FINGERPRINT_PATTERNS, {
    cwd: absoluteRoot,
    onlyFiles: true,
    unique: true,
  });
  const normalizedFiles = [...files].sort();
  const hash = createHash('sha256');

  for (const file of normalizedFiles) {
    const absolutePath = resolve(absoluteRoot, file);
    hash.update(relative(absoluteRoot, absolutePath).replace(/\\/g, '/'));
    hash.update('\n');
    hash.update(readFileSync(absolutePath));
    hash.update('\n');
  }

  return {
    algorithm: 'sha256',
    fileCount: normalizedFiles.length,
    files: normalizedFiles,
    value: hash.digest('hex'),
  };
}

export { MATH_BROWSER_SMOKE_FINGERPRINT_PATTERNS };
