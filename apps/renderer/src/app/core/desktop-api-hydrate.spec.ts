// @vitest-environment jsdom
import '@angular/compiler';
import { Injector } from '@angular/core';

import { DEFAULT_COLLECTIONS_FILE } from '@testrix/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DesktopApiService } from './desktop-api.service';

type Leaf = (...args: unknown[]) => unknown;

/** A bridge where every call resolves with `answer(path)`, or rejects when it throws. */
function fakeBridge(answer: (path: string) => unknown): unknown {
  const node = (path: string): unknown =>
    new Proxy(() => undefined, {
      get: (_target, key) => node(path ? `${path}.${String(key)}` : String(key)),
      apply: () => {
        if (path.endsWith('.onChanged') || path.startsWith('window.on'))
          return () => undefined;
        try {
          return Promise.resolve(answer(path));
        } catch (error) {
          return Promise.reject(error);
        }
      },
    }) as unknown as Leaf;
  return node('');
}

function createService(bridge: unknown): DesktopApiService {
  (window as unknown as { testrix: unknown }).testrix = bridge;
  window.matchMedia = vi.fn(() => ({ matches: false }) as MediaQueryList);
  return Injector.create({ providers: [DesktopApiService] }).get(DesktopApiService);
}

describe('DesktopApiService.hydrate', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as unknown as { testrix?: unknown }).testrix;
  });

  it('falls back to defaults and records every part that failed', async () => {
    // Arrange
    const service = createService(
      fakeBridge((path) => {
        throw new Error(`boom ${path}`);
      }),
    );

    // Act
    await service.hydrate();

    // Assert
    expect(service.collections()).toEqual(DEFAULT_COLLECTIONS_FILE);
    expect(service.hydrateFailures()).toContain('collections');
    expect(service.hydrateFailures()).toContain('settings');
    expect(console.error).toHaveBeenCalled();
  });

  it('records only the parts that failed', async () => {
    // Arrange
    const service = createService(
      fakeBridge((path) => {
        if (path === 'collections.get')
          return { ...DEFAULT_COLLECTIONS_FILE, nodes: [] };
        throw new Error('unused');
      }),
    );

    // Act
    await service.hydrate();

    // Assert
    expect(service.hydrateFailures()).not.toContain('collections');
    expect(service.hydrateFailures()).toContain('history');
  });
});
