import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { COPYRIGHT, PRODUCT_DESCRIPTION, PRODUCT_NAME, PUBLISHER_NAME } from '@testrix/contracts';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('desktop packaging identity', () => {
  it('stamps Testrix.exe with icon, publisher, and copyright', () => {
    const pkg = JSON.parse(readFileSync(path.join(desktopRoot, 'package.json'), 'utf8')) as {
      productName?: string;
      description?: string;
      author?: string | { readonly name?: string };
      copyright?: string;
    };
    const authorName = typeof pkg.author === 'string' ? pkg.author : pkg.author?.name;
    expect(pkg.productName).toBe(PRODUCT_NAME);
    expect(pkg.description).toBe(PRODUCT_DESCRIPTION);
    expect(authorName).toBe(PUBLISHER_NAME);
    expect(pkg.copyright).toBe(COPYRIGHT);

    const yml = readFileSync(path.join(desktopRoot, 'electron-builder.yml'), 'utf8');
    expect(yml).toContain(`productName: ${PRODUCT_NAME}`);
    expect(yml).toContain(`executableName: ${PRODUCT_NAME}`);
    expect(yml).toContain(`copyright: ${COPYRIGHT}`);
    expect(yml).toContain(PUBLISHER_NAME);
    expect(yml).toContain(`description: ${PRODUCT_DESCRIPTION}`);
    expect(yml).toContain('signAndEditExecutable: true');
    expect(yml).toContain('icon: icon.ico');
    expect(yml).toContain('icon: icon.png');
  });
});
