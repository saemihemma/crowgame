import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { compileLevel, type LevelSpec, SPECS_DIR, OUTPUT_DIR } from './level_compiler';

// Main
if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
}

if (!existsSync(SPECS_DIR)) {
    console.log('No level specs directory found. Skipping compilation.');
    process.exit(0);
}

const specFiles = readdirSync(SPECS_DIR).filter(f => f.endsWith('.json'));

if (specFiles.length === 0) {
    console.log('No level specs found. Skipping compilation.');
    process.exit(0);
}

console.log('Compiling levels...\n');

for (const file of specFiles) {
    const specPath = join(SPECS_DIR, file);
    const spec: LevelSpec = JSON.parse(readFileSync(specPath, 'utf-8'));

    const compiled = compileLevel(spec);
    const outputName = file.replace('.spec.json', '.json');
    const outputPath = join(OUTPUT_DIR, outputName);

    writeFileSync(outputPath, JSON.stringify(compiled, null, 2));
    console.log(`  Compiled: ${file} -> compiled/${outputName} (${compiled.width}x${compiled.height} tiles)`);
}

console.log(`\nDone! Compiled ${specFiles.length} level(s).`);
