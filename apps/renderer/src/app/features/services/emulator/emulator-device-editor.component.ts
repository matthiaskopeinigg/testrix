import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import {
  ANDROID_SDK_LICENSE_SUMMARY,
  ANDROID_SYSTEM_IMAGE_API_LEVELS,
  ANDROID_SYSTEM_IMAGE_TAGS,
  EMULATOR_DEVICE_PROFILES,
  androidSystemImageTagLabel,
  emptyAndroidToolchainStatus,
  findEmulatorDevice,
  findEmulatorDeviceProfile,
  isAvdEmulatorDevice,
  type AndroidSystemImageTag,
  type AndroidToolchainEvent,
  type AndroidToolchainStatus,
  type EmulatorDeviceProfileId,
} from '@testrix/contracts';
import {
  TxButtonComponent,
  TxCheckComponent,
  TxEmptyStateComponent,
  TxHintComponent,
  TxInputComponent,
  TxSelectComponent,
  type TxSelectOption,
} from '@testrix/ui';

import { DesktopApiService } from '../../../core/desktop-api.service';
import { WorkbenchStore, type WorkbenchTab } from '../../workbench/workbench.store';

@Component({
  selector: 'tx-emulator-device-editor',
  standalone: true,
  imports: [
    TxButtonComponent,
    TxCheckComponent,
    TxEmptyStateComponent,
    TxHintComponent,
    TxInputComponent,
    TxSelectComponent,
  ],
  templateUrl: './emulator-device-editor.component.html',
  styleUrl: './emulator-device-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmulatorDeviceEditorComponent {
  readonly tab = input.required<WorkbenchTab>();
  readonly desktop = inject(DesktopApiService);
  private readonly workbench = inject(WorkbenchStore);

  readonly status = signal<AndroidToolchainStatus>(emptyAndroidToolchainStatus());
  readonly busy = signal(false);
  readonly message = signal('');
  readonly progress = signal<AndroidToolchainEvent | null>(null);
  readonly showLicense = signal(false);
  readonly licenseSummary = ANDROID_SDK_LICENSE_SUMMARY;

  readonly device = computed(() => findEmulatorDevice(this.desktop.emulator(), this.tab().nodeId));
  readonly isAvdDevice = computed(() => {
    const device = this.device();
    return device ? isAvdEmulatorDevice(device) : false;
  });
  readonly isSelectedDevice = computed(
    () => this.desktop.emulator().selectedDeviceId === this.tab().nodeId,
  );
  readonly isRunning = computed(
    () => this.status().emulatorRunning && this.isSelectedDevice(),
  );
  readonly profileOptions = computed((): readonly TxSelectOption[] =>
    EMULATOR_DEVICE_PROFILES.map((item) => ({ value: item.id, label: item.label })),
  );
  readonly imageOptions: readonly TxSelectOption[] = ANDROID_SYSTEM_IMAGE_TAGS.map((tag) => ({
    value: tag,
    label: androidSystemImageTagLabel(tag),
  }));
  readonly apiOptions: readonly TxSelectOption[] = ANDROID_SYSTEM_IMAGE_API_LEVELS.map((api) => ({
    value: String(api),
    label: String(api),
  }));
  readonly imageTag = computed(() => this.desktop.settings().androidSystemImageTag);
  readonly imageApi = computed(() => String(this.desktop.settings().androidSystemImageApi ?? 34));
  readonly profileLabel = computed(() => {
    const device = this.device();
    if (!device)
      return '';
    if (isAvdEmulatorDevice(device))
      return device.avdName || 'AVD';
    return findEmulatorDeviceProfile(device.profile)?.label ?? device.profile;
  });
  readonly statusLabel = computed(() => {
    if (this.isRunning())
      return `Running${this.status().emulatorPid ? ` · PID ${this.status().emulatorPid}` : ''}`;
    if (this.status().busy)
      return 'Installing tools…';
    if (this.status().packagesReady)
      return this.isSelectedDevice()
        ? 'Ready'
        : this.isAvdDevice()
          ? 'Ready · select to start this AVD'
          : 'Ready · select to start this profile';
    if (this.status().licenseAccepted)
      return 'Activate to finish the Android install';
    return 'Needs Activate';
  });

  constructor() {
    void this.refreshLive();
    const off = this.desktop.api.services.onDeviceEvent((event) => {
      this.progress.set(event.phase === 'done' ? null : event);
      this.message.set(event.message);
      void this.refresh();
    });
    const timer = setInterval(() => void this.refreshLive(), 4_000);
    effect(() => {
      const request = this.workbench.emulatorBoot();
      const device = this.device();
      if (!request || !device || request.deviceId !== device.id)
        return;
      this.workbench.clearEmulatorBoot();
      void this.start(request.coldBoot);
    });
    inject(DestroyRef).onDestroy(() => {
      off();
      clearInterval(timer);
    });
  }

  async refresh(): Promise<void> {
    this.status.set(await this.desktop.api.services.device.status());
    this.desktop.emulator.set(await this.desktop.api.services.emulator.get());
  }

  async refreshLive(): Promise<void> {
    this.status.set(await this.desktop.api.services.device.refresh());
    this.desktop.emulator.set(await this.desktop.api.services.emulator.get());
  }

  async start(coldBoot = false): Promise<void> {
    const device = this.device();
    if (!device)
      return;
    if (this.busy() || this.status().busy)
      return;
    if (!this.status().packagesReady) {
      this.pendingBoot = { coldBoot };
      const accepted = this.status().licenseAccepted || Boolean(this.desktop.settings().androidSdkLicenseAcceptedAt);
      if (!accepted) {
        this.showLicense.set(true);
        return;
      }
      await this.installToolsThenBoot();
      return;
    }
    await this.boot(coldBoot);
  }

  cancelLicense(): void {
    this.showLicense.set(false);
    this.pendingBoot = null;
  }

  async acceptLicense(): Promise<void> {
    await this.desktop.patchSettings({
      androidSdkLicenseAcceptedAt: new Date().toISOString(),
    });
    this.showLicense.set(false);
    await this.installToolsThenBoot();
  }

  async setName(name: string): Promise<void> {
    const device = this.device();
    if (!device)
      return;
    const nextName = name.trim() || device.name;
    await this.patchDevice({ name: nextName });
    this.workbench.renameEmulatorDeviceTabs(device.id, nextName);
  }

  async setProfile(value: string): Promise<void> {
    const profile = value as EmulatorDeviceProfileId;
    if (!findEmulatorDeviceProfile(profile))
      return;
    await this.patchDevice({ profile });
  }

  async setOpenHome(openHome: boolean): Promise<void> {
    await this.patchDevice({ openHome });
  }

  async setImageTag(value: string): Promise<void> {
    const tag: AndroidSystemImageTag = value === 'google_apis_playstore' ? 'google_apis_playstore' : 'google_apis';
    if (tag === this.imageTag())
      return;
    await this.applyImage({ androidSystemImageTag: tag });
  }

  async setImageApi(value: string): Promise<void> {
    const api = Number(value);
    if (!Number.isInteger(api) || api === this.desktop.settings().androidSystemImageApi)
      return;
    await this.applyImage({ androidSystemImageApi: api });
  }

  private async applyImage(
    patch: { androidSystemImageTag?: AndroidSystemImageTag; androidSystemImageApi?: number },
  ): Promise<void> {
    this.busy.set(true);
    try {
      await this.desktop.patchSettings(patch);
      const result = await this.desktop.api.services.device.applySystemImage();
      this.status.set(result.status);
      this.message.set(result.error || 'System image updated.');
      if (!result.ok)
        this.progress.set({
          phase: 'error',
          percent: 0,
          message: result.error ?? 'Image switch failed.',
          error: result.error ?? undefined,
        });
    } finally {
      this.busy.set(false);
      await this.refreshLive();
    }
  }

  private pendingBoot: { readonly coldBoot: boolean } | null = null;

  private async installToolsThenBoot(): Promise<void> {
    const coldBoot = this.pendingBoot?.coldBoot ?? false;
    this.pendingBoot = null;
    this.busy.set(true);
    try {
      this.progress.set({ phase: 'download', percent: 1, message: 'Starting Android install…' });
      const result = await this.desktop.api.services.device.activate();
      this.status.set(result.status);
      if (!result.ok) {
        this.message.set(result.error || 'Install failed.');
        this.progress.set({
          phase: 'error',
          percent: 0,
          message: result.error ?? 'Install failed.',
          error: result.error ?? undefined,
        });
        return;
      }
      await this.boot(coldBoot);
    } finally {
      this.busy.set(false);
    }
  }

  private async boot(coldBoot: boolean): Promise<void> {
    const device = this.device();
    if (!device)
      return;
    this.busy.set(true);
    try {
      await this.desktop.saveEmulator({ selectedDeviceId: device.id });
      const result = await this.desktop.api.services.device.startEmulator({
        coldBoot,
        openHome: device.openHome,
      });
      this.status.set(result.status);
      this.message.set(
        result.error || (coldBoot ? `${device.name} cold booted.` : `${device.name} started.`),
      );
      if (!result.ok)
        this.progress.set({
          phase: 'error',
          percent: 0,
          message: result.error ?? 'Start failed.',
          error: result.error ?? undefined,
        });
    } finally {
      this.busy.set(false);
    }
  }

  async stop(): Promise<void> {
    this.busy.set(true);
    try {
      this.status.set((await this.desktop.api.services.device.stopEmulator()).status);
      this.message.set('Emulator stopped.');
    } finally {
      this.busy.set(false);
    }
  }

  private async patchDevice(
    patch: Partial<{ name: string; profile: EmulatorDeviceProfileId; openHome: boolean }>,
  ): Promise<void> {
    const device = this.device();
    if (!device)
      return;
    if (isAvdEmulatorDevice(device) && patch.profile !== undefined)
      return;
    const devices = this.desktop.emulator().devices.map((item) =>
      item.id === device.id ? { ...item, ...patch } : item,
    );
    await this.desktop.saveEmulator({ devices });
  }
}
