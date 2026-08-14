import { afterEach } from 'vitest';

import { TestBed } from '@angular/core/testing';

afterEach(async () => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  TestBed.resetTestingModule();
});
