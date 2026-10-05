import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const rendererRoot = join(here, '..');
const require = createRequire(join(rendererRoot, 'package.json'));
const pkgRoot = dirname(require.resolve('@plantuml/core/package.json'));
const outDir = join(rendererRoot, 'src', 'assets', 'plantuml');
const files = ['plantuml.js', 'viz-global.js', 'themes.js'];

mkdirSync(outDir, { recursive: true });

for (const file of files) {
  const from = join(pkgRoot, file);
  if (!existsSync(from))
    throw new Error(`Missing @plantuml/core file: ${file}`);
  copyFileSync(from, join(outDir, file));
  console.log(`synced ${file}`);
}
