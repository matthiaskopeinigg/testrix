import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  coerceCaptureTrafficFilterPrefs,
  type CaptureLogEntry,
  type CaptureResourceCategory,
  type CaptureTrafficFilterScope,
} from '@shared/testing';

import { ConfigService } from '@app/core/config/config.service';
import { CaptureEntryActionsService } from '@app/core/testing/capture-entry-actions.service';
import { CaptureWorkbenchStore } from '@app/core/testing/capture-workbench.store';
import { ElectronService } from '@app/core/electron/electron.service';
import { WorkspaceTabMotionController } from '@app/core/ui/workspace-tab-motion';
import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';
import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';

import { CapTabTrafficPanelComponent } from './cap-tab-traffic-panel.component';

@Component({
  selector: 'app-capture-workspace-tab',
  standalone: true,
  imports: [
    FormsModule,
    TxBannerComponent,
    TxButtonComponent,
    TxFormFieldComponent,
    TxIconComponent,
    TxInputComponent,
    TxTagComponent,
    CapTabTrafficPanelComponent,
  ],
  templateUrl: './capture-workspace-tab.component.html',
  styleUrl: './capture-workspace-tab.component.scss',
  host: { class: 'testing-workspace-tab-host' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaptureWorkspaceTabComponent {
  protected readonly capture = inject(CaptureWorkbenchStore);
  private readonly captureActions = inject(CaptureEntryActionsService);
  private readonly configService = inject(ConfigService);
  private readonly electron = inject(ElectronService);
  private readonly uiPreferences = inject(UiPreferencesService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly tabMotion = new WorkspaceTabMotionController(
    this.uiPreferences,
    this.destroyRef,
  );

  readonly resourceId = input.required<string>();
  readonly active = input(false);

  protected readonly trafficFilter = signal('');
  protected readonly trafficFilterScope = signal<CaptureTrafficFilterScope>('all');
  protected readonly trafficResourceCategory = signal<CaptureResourceCategory>('all');
  private trafficFiltersLoadedForSessionId: string | null = null;

  protected readonly sessionId = computed(() =>
    this.resourceId().startsWith('cap:') ? this.resourceId().slice(4) : '',
  );

  protected readonly item = computed(() => {
    const id = this.sessionId();
    return id ? this.capture.find(id) : null;
  });

  protected readonly missing = computed(() => !!this.sessionId() && !this.item());

  protected readonly title = computed(() => this.capture.labelForResource(this.resourceId()));

  protected readonly sessionRecording = computed(() => {
    const id = this.sessionId();
    return id ? this.capture.isSessionRecording(id) : false;
  });

  protected readonly sessionEntries = computed(() => {
    const id = this.sessionId();
    if (!id) {
      return [];
    }
    return this.capture.entriesBySession()[id] ?? [];
  });

  protected readonly captureSupported = computed(() => !!this.electron.bridge()?.testing);

  constructor() {
    this.tabMotion.settleLoadImmediately();
    this.tabMotion.bindLoadReplay(
      () => `${this.configService.sessionRevision()}:${this.resourceId()}`,
      () => 1,
      { tabActive: () => this.active() },
    );

    effect(() => {
      const id = this.sessionId();
      if (!id || !this.active()) {
        return;
      }
      void this.capture.refreshEntriesForSession(id);
    });

    effect(() => {
      const id = this.sessionId();
      const session = this.item();
      if (!id || !session || this.trafficFiltersLoadedForSessionId === id) {
        return;
      }
      this.trafficFiltersLoadedForSessionId = id;
      const prefs = coerceCaptureTrafficFilterPrefs(session.trafficFilter);
      this.trafficFilter.set(prefs.query);
      this.trafficFilterScope.set(prefs.scope);
      this.trafficResourceCategory.set(prefs.resourceCategory);
    });
  }

  protected handleNameChange(name: string): void {
    const id = this.sessionId();
    if (!id) {
      return;
    }
    this.capture.patchItem(id, { name: name.trim() || 'New capture' });
  }

  protected handleStartUrlChange(url: string): void {
    const id = this.sessionId();
    if (!id) {
      return;
    }
    this.capture.patchItem(id, { startUrl: url.trim() || 'about:blank' });
  }

  protected canStartCapture(): boolean {
    return (
      this.captureSupported() &&
      !this.sessionRecording() &&
      !(this.capture.running() && !this.sessionRecording())
    );
  }

  protected async handleStartUrlSubmitted(): Promise<void> {
    if (!this.canStartCapture()) {
      return;
    }
    const id = this.sessionId();
    if (!id) {
      return;
    }
    await this.capture.startSession(id);
  }

  protected async handleRunToggle(): Promise<void> {
    const id = this.sessionId();
    if (!id) {
      return;
    }
    if (this.sessionRecording()) {
      await this.capture.stopSession();
    } else {
      await this.capture.startSession(id);
    }
  }

  protected async handleClearHistory(): Promise<void> {
    const id = this.sessionId();
    if (!id) {
      return;
    }
    await this.capture.clearSessionEntries(id);
  }

  protected handleFilterQueryChange(query: string): void {
    this.trafficFilter.set(query);
    this.persistTrafficFilter();
  }

  protected handleFilterScopeChange(scope: CaptureTrafficFilterScope): void {
    this.trafficFilterScope.set(scope);
    this.persistTrafficFilter();
  }

  protected handleResourceCategoryChange(category: CaptureResourceCategory): void {
    this.trafficResourceCategory.set(category);
    this.persistTrafficFilter();
  }

  protected handleCreateCollectionRequest(entry: CaptureLogEntry): void {
    this.captureActions.createCollectionRequest(entry);
  }

  protected handleCreateFlowFromCapture(entry: CaptureLogEntry): void {
    this.captureActions.createFlowFromCapture(entry);
  }

  private persistTrafficFilter(): void {
    const id = this.sessionId();
    if (!id) {
      return;
    }
    this.capture.patchTrafficFilter(id, {
      query: this.trafficFilter(),
      scope: this.trafficFilterScope(),
      resourceCategory: this.trafficResourceCategory(),
    });
  }
}
