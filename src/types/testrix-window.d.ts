import type { ElectronRendererBridge } from '../app/core/electron/electron-renderer.types';

declare global {
  interface Window {
    readonly testrix?: ElectronRendererBridge;
  }
}

export {};
