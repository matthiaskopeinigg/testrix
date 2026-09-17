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
