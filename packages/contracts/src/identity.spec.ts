import { describe, expect, it } from 'vitest';

import {
  COPYRIGHT,
  MAIN_EXECUTABLE,
  PRODUCT_DESCRIPTION,
  PRODUCT_NAME,
  PUBLISHER_NAME,
} from './identity';

describe('product identity', () => {
  it('names the Windows executable and publisher', () => {
    expect(PRODUCT_NAME).toBe('Testrix');
    expect(MAIN_EXECUTABLE).toBe('Testrix.exe');
    expect(PUBLISHER_NAME).toBe('Matthias Kopeinigg');
    expect(COPYRIGHT).toBe(`Copyright © 2026 ${PUBLISHER_NAME}`);
    expect(PRODUCT_DESCRIPTION).toContain(PRODUCT_NAME);
  });
});
