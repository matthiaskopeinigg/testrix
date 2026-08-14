import { describe, expect, it, vi } from 'vitest';

import { runTestingHydrateOnce } from './testing-hydrate-once';

describe('runTestingHydrateOnce', () => {
  it('loads once and shares in-flight work', async () => {
    const inflight = { current: null as Promise<void> | null };
    let loaded = false;
    const load = vi.fn(async () => {
      loaded = true;
    });

    await Promise.all([
      runTestingHydrateOnce(() => loaded, inflight, load),
      runTestingHydrateOnce(() => loaded, inflight, load),
    ]);

    expect(load).toHaveBeenCalledTimes(1);
    expect(loaded).toBe(true);
  });

  it('skips load when already hydrated', async () => {
    const inflight = { current: null as Promise<void> | null };
    const load = vi.fn(async () => undefined);

    await runTestingHydrateOnce(() => true, inflight, load);

    expect(load).not.toHaveBeenCalled();
  });
});
