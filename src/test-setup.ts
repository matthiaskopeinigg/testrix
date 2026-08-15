import { afterEach, vi } from 'vitest';

import { TestBed } from '@angular/core/testing';

/**
 * Wait for in-flight dynamic imports before tearing down jsdom.
 * Without this, Vitest 4 can fail suites with EnvironmentTeardownError when
 * Angular components lazy-load chunks during parallel CI runs.
 */
afterEach(async () => {
  await vi.dynamicImportSettled();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  TestBed.resetTestingModule();
});
