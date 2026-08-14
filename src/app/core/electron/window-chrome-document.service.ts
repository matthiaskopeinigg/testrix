import { DestroyRef, Injectable, inject } from '@angular/core';

/**
 * Marks the renderer document when running inside the Electron main window
 * so global SCSS can tune frameless chrome (shadow, blur, no edge stroke).
 */
@Injectable({ providedIn: 'root' })
export class WindowChromeDocumentService {
  private readonly destroyRef = inject(DestroyRef);

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

    const controls = bridge.windowControls;
    if (!controls.getChromeState || !controls.onChromeStateChange) {
      return;
    }

    void controls.getChromeState().then((state) => {
      this.applyEdgeToEdge(state.edgeToEdge);
    });

    const unsubscribe = controls.onChromeStateChange((state) => {
      this.applyEdgeToEdge(state.edgeToEdge);
    });
    this.destroyRef.onDestroy(unsubscribe);
  }

  private applyEdgeToEdge(edgeToEdge: boolean): void {
    document.documentElement.classList.toggle('tx-electron-app--edge-to-edge', edgeToEdge);
  }
}
