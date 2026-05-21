import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { freezeWhileTabInactive } from './workspace-tab-active.util';

describe('freezeWhileTabInactive', () => {
  it('returns live values while active and frozen values while inactive', () => {
    const active = signal(true);
    const source = signal(1);
    const frozen = freezeWhileTabInactive(active, () => source());

    expect(frozen()).toBe(1);
    source.set(2);
    expect(frozen()).toBe(2);

    active.set(false);
    source.set(3);
    expect(frozen()).toBe(2);

    active.set(true);
    expect(frozen()).toBe(3);
  });
});
