import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked, type AnimationCallbackEvent } from '@angular/core';
import {
  normalizeLoadSection,
  LOAD_SECTIONS,
  type LoadArtifactFields,
  type LoadSection,
} from '@testrix/contracts';
import { TxEmptyStateComponent, TxHintComponent, TxInputComponent } from '@testrix/ui';

import { ConfirmDialogService } from '../../../core/confirm-dialog.service';
import { DesktopApiService } from '../../../core/desktop-api.service';
import { EnvironmentsStore } from '../../environments/environments.store';
import { WorkbenchStore, type WorkbenchTab } from '../../workbench/workbench.store';
import { ServicesStore } from '../services.store';
import { runPaneEnter, runPaneLeave } from '../../../core/pane-slide-anim';
import { LtDocsPanelComponent, type LtDocsPatch } from './lt-docs-panel.component';
import { LtOverviewPanelComponent } from './lt-overview-panel.component';
import { LtProfilePanelComponent, type LtProfilePatch } from './lt-profile-panel.component';
import { LtResultsPanelComponent } from './lt-results-panel.component';
import { LtTargetPanelComponent, type LtTargetPatch } from './lt-target-panel.component';
import { LtThresholdsPanelComponent, type LtThresholdsPatch } from './lt-thresholds-panel.component';

interface SectionItem {
  readonly id: LoadSection;
  readonly label: string;
}

const SECTION_ITEMS: readonly SectionItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'target', label: 'Target' },
  { id: 'profile', label: 'Profile' },
  { id: 'thresholds', label: 'Thresholds' },
  { id: 'docs', label: 'Docs' },
];

const RESULTS_HANDLE_PX = 5;
const RESULTS_MIN_PX = 140;
const RESULTS_DEFAULT_PX = 360;
const RESULTS_AUTO_HIDE_PX = 120;

@Component({
  selector: 'tx-load-editor',
  standalone: true,
  imports: [
    TxEmptyStateComponent,
    TxHintComponent,
    TxInputComponent,
    LtOverviewPanelComponent,
    LtTargetPanelComponent,
    LtProfilePanelComponent,
    LtThresholdsPanelComponent,
    LtDocsPanelComponent,
    LtResultsPanelComponent,
  ],
  templateUrl: './load-editor.component.html',
  styleUrl: './load-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:flex;flex:1;min-height:0;' },
})
export class LoadEditorComponent {
  readonly tab = input.required<WorkbenchTab>();
  readonly store = inject(ServicesStore);
  readonly workbench = inject(WorkbenchStore);
  private readonly desktop = inject(DesktopApiService);
  private readonly environments = inject(EnvironmentsStore);
  private readonly confirm = inject(ConfirmDialogService);

  readonly sectionSlideDir = signal<'left' | 'right' | null>(null);
  readonly section = computed(() => normalizeLoadSection(this.tab().serviceSection));
  readonly completionBanner = signal<{ readonly kind: 'success' | 'error'; readonly title: string } | null>(
    null,
  );
  readonly resultsHeightPx = signal(RESULTS_DEFAULT_PX);
  readonly resultsHidden = signal(false);
  readonly resizing = signal(false);
  readonly handleHeightPx = RESULTS_HANDLE_PX;

  readonly sections = SECTION_ITEMS;
  readonly load = computed(() => this.store.findLoad(this.tab().nodeId));

  readonly isRunning = computed(() => {
    const status = this.store.loadStatus();
    const metrics = this.store.loadMetrics();
    return status.running || !!metrics?.running;
  });

  readonly runProgressPercent = computed(() => {
    const artifact = this.load();
    const metrics = this.store.loadMetrics();
    if (!this.isRunning() || !artifact || !metrics)
      return 0;
    const total = Math.max(1, artifact.durationSec) * 1000;
    return Math.max(0, Math.min(100, Math.round((metrics.elapsedMs / total) * 100)));
  });

  readonly envOptions = computed(() => [
    { value: '', label: 'App active environment' },
    ...this.environments.items().map((item) => ({ value: item.id, label: item.name })),
  ]);

  readonly envName = computed(() => {
    const artifact = this.load();
    if (!artifact)
      return '—';
    if (!artifact.environmentId) {
      const active = this.environments.activeId();
      const found = this.environments.items().find((item) => item.id === active);
      return found ? `${found.name} (active)` : 'App active';
    }
    return this.environments.items().find((item) => item.id === artifact.environmentId)?.name ?? 'Missing env';
  });

  readonly canRun = computed(() => {
    const artifact = this.load();
    if (!artifact || this.isRunning())
      return false;
    if (artifact.targetSource === 'collection')
      return !!artifact.targetRequestId || !!artifact.url.trim();
    return !!artifact.url.trim();
  });

  readonly collectionTree = computed(() => this.desktop.collections().collections);

  private lastBannerKey: string | null = null;
  private wasRunning = false;
  private hydratedTabId: string | null = null;
  private readonly checkpointPrompted = new Set<string>();

  constructor() {
    effect(() => {
      const tab = this.tab();
      const next = normalizeLoadSection(tab.serviceSection);
      if (tab.serviceSection !== next) {
        this.workbench.patchTab(tab.id, { serviceSection: next });
        return;
      }
      untracked(() => {
        if (this.hydratedTabId === tab.id)
          return;
        this.hydratedTabId = tab.id;
        this.sectionSlideDir.set(null);
        this.resultsHidden.set(
          tab.resultsDockHidden === true || this.workbench.isResultsDockHidden(tab.nodeId),
        );
      });
    });

    effect(() => {
      const lastId = this.load()?.runs[0]?.id ?? null;
      if (this.lastBannerKey === null && lastId)
        this.lastBannerKey = lastId;
    });

    effect(() => {
      const tab = this.tab();
      if (tab.kind !== 'load' || this.isRunning())
        return;
      const checkpoint = this.store.runCheckpoint(tab.nodeId);
      if (!checkpoint || checkpoint.kind !== 'load')
        return;
      if (this.checkpointPrompted.has(tab.nodeId))
        return;
      this.checkpointPrompted.add(tab.nodeId);
      untracked(() => void this.offerLoadCheckpoint(tab.nodeId, checkpoint));
    });

    effect(() => {
      const running = this.isRunning();
      const artifact = this.load();
      if (running) {
        this.wasRunning = true;
        this.setResultsHidden(false);
        return;
      }
      if (!this.wasRunning || !artifact)
        return;
      const last = artifact.runs[0];
      if (!last)
        return;
      const key = last.id;
      if (key === this.lastBannerKey)
        return;
      this.wasRunning = false;
      this.lastBannerKey = key;
      this.completionBanner.set({
        kind: last.error ? 'error' : 'success',
        title: last.error
          ? `Failed · ${last.error}`
          : `Completed · ${last.rps.toFixed(1)} rps · p95 ${Math.round(last.p95Ms)} ms`,
      });
      window.setTimeout(() => {
        if (this.lastBannerKey === key)
          this.completionBanner.set(null);
      }, 4200);
    });
  }

  handleSection(id: LoadSection): void {
    if (id === this.section())
      return;
    const current = LOAD_SECTIONS.indexOf(this.section());
    const next = LOAD_SECTIONS.indexOf(id);
    this.sectionSlideDir.set(next >= current ? 'right' : 'left');
    this.workbench.patchTab(this.tab().id, { serviceSection: id });
  }

  handlePaneEnter(event: AnimationCallbackEvent): void {
    runPaneEnter(event, this.sectionSlideDir());
  }

  handlePaneLeave(event: AnimationCallbackEvent): void {
    runPaneLeave(event, this.sectionSlideDir());
  }

  handleOpenResults(): void {
    this.setResultsHidden(false);
  }

  hideResults(event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    this.setResultsHidden(true);
  }

  revealResults(): void {
    this.setResultsHidden(false);
  }

  handleResultsResizeStart(event: PointerEvent): void {
    event.preventDefault();
    const origin =
      (event.currentTarget instanceof HTMLElement ? event.currentTarget : null) ??
      (event.target instanceof HTMLElement ? event.target : null);
    const host = origin?.closest('.lt-tab');
    if (!(host instanceof HTMLElement))
      return;

    this.resizing.set(true);
    const startY = event.clientY;
    const startHeight = this.resultsHeightPx();
    const chrome = host.querySelector('.lt-tab__chrome');
    const chromeHeight =
      chrome instanceof HTMLElement ? Math.ceil(chrome.getBoundingClientRect().height) : 72;
    const maxHeight = Math.max(
      RESULTS_MIN_PX,
      Math.floor(host.getBoundingClientRect().height - RESULTS_HANDLE_PX - chromeHeight - 4),
    );
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const onMove = (moveEvent: PointerEvent): void => {
      if (!this.resizing())
        return;
      const next = Math.min(maxHeight, Math.max(RESULTS_MIN_PX, startHeight + (startY - moveEvent.clientY)));
      if (next <= RESULTS_AUTO_HIDE_PX) {
        this.setResultsHidden(true);
        cleanup();
        return;
      }
      this.resultsHeightPx.set(next);
    };

    const onUp = (): void => {
      cleanup();
    };

    const cleanup = (): void => {
      this.resizing.set(false);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  patchName(name: string): void {
    const artifact = this.load();
    if (!artifact)
      return;
    void this.store.patchLoad(artifact.id, { name });
    this.workbench.patchTab(this.tab().id, { title: name });
  }

  runLoad(): void {
    const artifact = this.load();
    if (!artifact || !this.canRun())
      return;
    this.setResultsHidden(false);
    void this.store.startLoad(artifact.id);
  }

  cancelLoad(): void {
    void this.store.stopLoad();
  }

  clearHistory(): void {
    const artifact = this.load();
    if (!artifact)
      return;
    void this.store.patchLoad(artifact.id, { runs: [] });
  }

  patchTarget(patch: LtTargetPatch): void {
    this.patchFields(patch);
  }

  patchProfile(patch: LtProfilePatch): void {
    this.patchFields(patch);
  }

  patchThresholds(patch: LtThresholdsPatch): void {
    this.patchFields(patch);
  }

  patchDocs(patch: LtDocsPatch): void {
    this.patchFields(patch);
  }

  private setResultsHidden(hidden: boolean): void {
    if (this.resultsHidden() === hidden)
      return;
    this.resultsHidden.set(hidden);
    const tab = this.tab();
    this.workbench.setResultsDockHidden(tab.nodeId, hidden);
    this.workbench.patchTab(tab.id, { resultsDockHidden: hidden });
  }

  private patchFields(patch: Partial<LoadArtifactFields>): void {
    const artifact = this.load();
    if (!artifact)
      return;
    void this.store.patchLoad(artifact.id, patch);
  }

  private async offerLoadCheckpoint(
    loadId: string,
    checkpoint: { readonly savedAt: string; readonly kind: 'flow' | 'load'; readonly json: string },
  ): Promise<void> {
    const when = new Date(checkpoint.savedAt).toLocaleString();
    const ok = await this.confirm.ask({
      title: 'Resume interrupted load run?',
      body: `A load checkpoint from ${when} is saved in this session. Restore the last live metrics snapshot, or discard the checkpoint.`,
      confirmLabel: 'Restore',
      cancelLabel: 'Discard',
    });
    if (ok) {
      this.store.restoreLoadRunCheckpoint(loadId);
      this.setResultsHidden(false);
      return;
    }
    this.store.clearRunCheckpoint(loadId);
  }
}
