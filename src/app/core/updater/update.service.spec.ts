import { TestBed } from '@angular/core/testing';

import { createDefaultSettings } from '@shared/config';
import type { UpdaterStatus } from '@shared/updater/updater-status.schema';

import { ConfigService } from '../config/config.service';
import { ElectronService } from '../electron/electron.service';

import { TxNotificationService } from '../notifications/tx-notification.service';

import { UpdateBannerContextService } from './update-banner-context.service';
import { UpdateService } from './update.service';

describe('UpdateService', () => {
  let service: UpdateService;
  let config: ConfigService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        UpdateService,
        UpdateBannerContextService,
        {
          provide: TxNotificationService,
          useValue: { showSuccess: vi.fn(), showError: vi.fn() },
        },
        {
          provide: ElectronService,
          useValue: { hasBridge: () => false, bridge: () => undefined },
        },
        ConfigService,
      ],
    });

    service = TestBed.inject(UpdateService);
    config = TestBed.inject(ConfigService);
    const settings = createDefaultSettings();
    config.syncSettings(settings);
  });

  it('hides banner when offer version is ignored', async () => {
    const available: UpdaterStatus = {
      state: 'available',
      info: { version: '0.2.0' },
    };

    (service as unknown as { statusState: { set: (v: UpdaterStatus) => void } }).statusState.set(
      available,
    );

    expect(service.showUpdateBanner()).toBe(true);

    await service.ignoreCurrentOffer();

    expect(service.showUpdateBanner()).toBe(false);
  });

  it('shows banner again when a different version is offered', async () => {
    await config.patchSettings({ updates: { ignoredOfferVersion: '0.2.0' } });

    (service as unknown as { statusState: { set: (v: UpdaterStatus) => void } }).statusState.set({
      state: 'available',
      info: { version: '0.3.0' },
    });

    expect(service.showUpdateBanner()).toBe(true);
  });

  it('simulateUpdateAvailable sets available state in dev toolkit', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        UpdateService,
        UpdateBannerContextService,
        {
          provide: TxNotificationService,
          useValue: { showSuccess: vi.fn(), showError: vi.fn() },
        },
        ConfigService,
        {
          provide: ElectronService,
          useValue: {
            hasBridge: () => true,
            isDevToolkit: () => true,
            bridge: () => ({
              versions: { app: '0.1.0', electron: '0.0.0', chrome: '0.0.0' },
            }),
          },
        },
      ],
    });

    const simService = TestBed.inject(UpdateService);
    const settings = createDefaultSettings();
    TestBed.inject(ConfigService).syncSettings(settings);

    await simService.simulateUpdateAvailable();

    expect(simService.status().state).toBe('available');
    expect(simService.status().info?.version).toBe('0.1.0-sim');
    expect(simService.showUpdateBanner()).toBe(true);
  });

  it('simulateUpdateDownloading animates download then downloaded', async () => {
    vi.useFakeTimers();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        UpdateService,
        UpdateBannerContextService,
        {
          provide: TxNotificationService,
          useValue: { showSuccess: vi.fn(), showError: vi.fn() },
        },
        ConfigService,
        {
          provide: ElectronService,
          useValue: {
            hasBridge: () => true,
            isDevToolkit: () => true,
            bridge: () => ({
              versions: { app: '0.1.0', electron: '0.0.0', chrome: '0.0.0' },
            }),
          },
        },
      ],
    });

    const simService = TestBed.inject(UpdateService);
    const settings = createDefaultSettings();
    TestBed.inject(ConfigService).syncSettings(settings);

    await simService.simulateUpdateDownloading();

    expect(simService.status().state).toBe('downloading');
    expect(simService.status().info?.percent).toBe(0);
    expect(simService.showUpdateBanner()).toBe(true);

    await vi.advanceTimersByTimeAsync(4000);

    expect(simService.status().state).toBe('downloaded');
    expect(simService.status().info?.version).toBe('0.1.0-sim');
    expect(simService.showUpdateBanner()).toBe(true);

    vi.useRealTimers();
  });

  it('simulateUpdateInstalling shows overlay then clears', async () => {
    vi.useFakeTimers();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        UpdateService,
        UpdateBannerContextService,
        {
          provide: TxNotificationService,
          useValue: { showSuccess: vi.fn(), showError: vi.fn() },
        },
        ConfigService,
        {
          provide: ElectronService,
          useValue: {
            hasBridge: () => true,
            isDevToolkit: () => true,
            bridge: () => ({
              versions: { app: '0.1.0', electron: '0.0.0', chrome: '0.0.0' },
            }),
          },
        },
      ],
    });

    const simService = TestBed.inject(UpdateService);
    TestBed.inject(ConfigService).syncSettings(createDefaultSettings());

    await simService.simulateUpdateInstalling();

    expect(simService.showInstallOverlay()).toBe(true);
    expect(simService.showUpdateBanner()).toBe(false);

    await vi.advanceTimersByTimeAsync(2900);

    expect(simService.showInstallOverlay()).toBe(false);
    expect(simService.status().state).toBe('idle');

    vi.useRealTimers();
  });

  it('downloadAndInstall runs install after dev simulation completes', async () => {
    vi.useFakeTimers();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        UpdateService,
        UpdateBannerContextService,
        {
          provide: TxNotificationService,
          useValue: { showSuccess: vi.fn(), showError: vi.fn() },
        },
        ConfigService,
        {
          provide: ElectronService,
          useValue: {
            hasBridge: () => true,
            isDevToolkit: () => true,
            bridge: () => ({
              versions: { app: '0.1.0', electron: '0.0.0', chrome: '0.0.0' },
            }),
          },
        },
      ],
    });

    const simService = TestBed.inject(UpdateService);
    const notifications = TestBed.inject(TxNotificationService);
    TestBed.inject(ConfigService).syncSettings(createDefaultSettings());

    await simService.simulateUpdateAvailable();
    void simService.downloadAndInstall();
    await vi.advanceTimersByTimeAsync(7000);

    expect(simService.showInstallOverlay()).toBe(false);
    expect(notifications.showSuccess).toHaveBeenCalledWith(
      'Dev preview: restart to install was not run.',
    );
    expect(simService.status().state).toBe('idle');

    vi.useRealTimers();
  });
});
