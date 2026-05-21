import { Injectable } from '@angular/core';

/**
 * Marks the renderer document when running inside the Electron main window
 * so global SCSS can tune frameless chrome (shadow, blur, no edge stroke).
 */
@Injectable({ providedIn: 'root' })
export class WindowChromeDocumentService {
  constructor() {
    if (typeof document === 'undefined') {
      return;
    }

    const bridge = typeof window !== 'undefined' ? window.testrix : undefined;
    if (!bridge) {
      return;
    }

    const root = document.documentElement;
    root.dataset['platform'] = bridge.platform;
    root.classList.add('tx-electron-app');
    if (bridge.opaqueDevWindow) {
      root.classList.add('tx-electron-app--dev-opaque');
    }
  }
}
