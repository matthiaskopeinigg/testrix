import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Directory of the bundled Electron entry (dist/). Works in CJS output.
 */
export function bundledDir(): string {
  if (typeof __dirname === 'string' && __dirname.length > 0) {
    return __dirname;
  }
  return process.cwd();
}

export function bundledPath(...segments: string[]): string {
  return path.resolve(bundledDir(), ...segments);
}

/**
 * File copied beside the asar as extraResources (`browser/`, `splash/`, `error/`).
 * Unpackaged runs fall back to the repo path.
 */
export function resolveExtraResource(packagedRelative: string, fallback: string): string {
  const resources = typeof process.resourcesPath === 'string' ? process.resourcesPath : '';
  if (resources) {
    const file = path.join(resources, packagedRelative);
    if (existsSync(file)) return file;
  }
  return fallback;
}
