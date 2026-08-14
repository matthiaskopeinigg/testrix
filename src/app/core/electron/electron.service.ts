import { Injectable } from '@angular/core';

import type { ElectronRendererBridge } from './electron-renderer.types';

/** Typed access to preload bridge exposed as `window.testrix`. */

@Injectable({ providedIn: 'root' })
export class ElectronService {
  hasBridge(): boolean {
    return typeof window !== 'undefined' && !!window.testrix;

  }



  bridge(): ElectronRendererBridge | undefined {
    return window.testrix;
  }

  /** Electron dev toolkit (`npm run dev` / `TESTRIX_DEV=1`). Always false in production builds. */
  isDevToolkit(): boolean {
    return this.bridge()?.devToolkit === true;
  }
}
