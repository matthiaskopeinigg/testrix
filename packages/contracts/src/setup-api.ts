export const SetupIpcChannels = {
  getMeta: 'testrix-setup:getMeta',
  chooseDirectory: 'testrix-setup:chooseDirectory',
  startInstall: 'testrix-setup:startInstall',
  startUninstall: 'testrix-setup:startUninstall',
  cancel: 'testrix-setup:cancel',
  launchApp: 'testrix-setup:launchApp',
  windowMinimize: 'testrix-setup:windowMinimize',
  windowClose: 'testrix-setup:windowClose',
  openExternal: 'testrix-setup:openExternal',
  progress: 'testrix-setup:progress',
} as const;

export type SetupMode = 'install' | 'uninstall';

export type SetupScope = 'user' | 'machine';

export interface SetupMeta {
  readonly mode: SetupMode;
  readonly version: string;
  readonly productName: string;
  readonly defaultDir: string;
  readonly defaultScope: SetupScope;
  readonly installDir: string | null;
  readonly installScope: SetupScope | null;
  readonly preview: boolean;
  readonly theme: 'dark' | 'light';
}

export interface SetupProgressEvent {
  readonly phase: 'extract' | 'copy' | 'register' | 'cleanup' | 'done' | 'error';
  readonly label: string;
  readonly percent: number | null;
  readonly error?: string;
}

export interface SetupInstallRequest {
  readonly scope: SetupScope;
  readonly installDir: string;
  readonly launchWhenReady: boolean;
  readonly createShortcuts: boolean;
}

export interface SetupUninstallRequest {
  readonly removeUserData: boolean;
}

export interface SetupDesktopApi {
  readonly getMeta: () => Promise<SetupMeta>;
  readonly chooseDirectory: (current: string) => Promise<string | null>;
  readonly startInstall: (request: SetupInstallRequest) => Promise<void>;
  readonly startUninstall: (request: SetupUninstallRequest) => Promise<void>;
  readonly cancel: () => Promise<void>;
  readonly launchApp: () => Promise<void>;
  readonly windowMinimize: () => Promise<void>;
  readonly windowClose: () => Promise<void>;
  readonly openExternal: (url: string) => Promise<void>;
  readonly onProgress: (listener: (event: SetupProgressEvent) => void) => () => void;
}

declare global {
  interface Window {
    testrixSetup?: SetupDesktopApi;
  }
}

export {};
