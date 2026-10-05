import { describe, expect, it, vi } from 'vitest';

import { DeviceHierarchyCache } from './device-hierarchy-cache';

describe('DeviceHierarchyCache', () => {
  it('returns cached xml within the TTL', () => {
    const cache = new DeviceHierarchyCache(1_000);
    cache.set('emu-1', '<hierarchy />');
    expect(cache.get('emu-1')).toBe('<hierarchy />');
  });

  it('expires after the TTL', () => {
    vi.useFakeTimers();
    const cache = new DeviceHierarchyCache(400);
    cache.set('emu-1', '<hierarchy />');
    vi.advanceTimersByTime(401);
    expect(cache.get('emu-1')).toBeNull();
    vi.useRealTimers();
  });

  it('invalidates a serial after mutations', () => {
    const cache = new DeviceHierarchyCache(1_000);
    cache.set('emu-1', '<hierarchy />');
    cache.invalidate('emu-1');
    expect(cache.get('emu-1')).toBeNull();
  });
});
