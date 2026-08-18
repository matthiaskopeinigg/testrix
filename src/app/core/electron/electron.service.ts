import { Injectable } from '@angular/core';

import type { ElectronRendererBridge } from './electron-renderer.types';

const BRIDGE_READY_MAX_FRAMES = 120;

/** Typed access to preload bridge exposed as `window.testrix`. */
@Injectable({ providedIn: 'root' })
export class ElectronService {
  /** True when `window.testrix` is already exposed. */
  hasBridge(): boolean {
    return typeof window !== 'undefined' && !!window.testrix;
  }

  /** Preload bridge, or `undefined` outside Electron. */
  bridge(): ElectronRendererBridge | undefined {
    return window.testrix;
  }

  /**
   * Waits for preload to expose `window.testrix` (Angular can paint first under `ng serve`).
   * Browser-only Vitest / `ng serve` in Chrome returns immediately.
   */
  async whenBridgeReady(maxFrames = BRIDGE_READY_MAX_FRAMES): Promise<ElectronRendererBridge | undefined> {
    const existing = this.bridge();
    if (existing) {
      return existing;
    }
    if (typeof window === 'undefined') {
      return undefined;
    }
    if (!/Electron/i.test(window.navigator.userAgent)) {
      return undefined;
    }

    for (let attempt = 0; attempt < maxFrames; attempt += 1) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      const ready = this.bridge();
      if (ready) {
        return ready;
      }
    }

    return undefined;
  }

  /** Electron dev toolkit (`npm run dev` / `TESTRIX_DEV=1`). Always false in production builds. */
  isDevToolkit(): boolean {
    return this.bridge()?.devToolkit === true;
  }
}
