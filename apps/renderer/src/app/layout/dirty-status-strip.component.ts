import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { TxHintComponent } from '@testrix/ui';

import { DesktopApiService } from '../core/desktop-api.service';
import { DirtyTabsRegistry } from '../core/dirty-tabs.registry';
import { ShellStateService } from '../core/shell-state.service';
import { HistoryStore } from '../features/history/history.store';
import { WorkbenchStore } from '../features/workbench/workbench.store';

@Component({
  selector: 'tx-dirty-status-strip',
  standalone: true,
  imports: [TxHintComponent],
  templateUrl: './dirty-status-strip.component.html',
  styleUrl: './dirty-status-strip.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DirtyStatusStripComponent {
  private readonly workbench = inject(WorkbenchStore);
  private readonly history = inject(HistoryStore);
  private readonly desktop = inject(DesktopApiService);
  private readonly shell = inject(ShellStateService);
  private readonly dirtyTabs = inject(DirtyTabsRegistry);

  readonly footprintHeavy = signal(false);
  readonly runInterrupted = signal(false);

  private dirtyCursor = 0;

  readonly unsavedCount = computed(() => this.dirtyTabs.count());

  readonly failedCount = computed(() =>
    this.history.entries()
      .slice(0, 40)
      .filter((entry) => {
        const status = entry.status;
        return status == null || status >= 400 || status === 0;
      }).length,
  );

  readonly visible = computed(
    () =>
      this.unsavedCount() > 0
      || this.failedCount() > 0
      || this.footprintHeavy()
      || this.runInterrupted(),
  );

  constructor() {
    void this.refreshFootprint();

    effect(() => {
      this.dirtyTabs.count();
      this.workbench.tabCount();
      this.history.entries();
      untracked(() => {
        void this.refreshFootprint();
      });
    });

    effect(() => {
      const open = this.shell.settingsOpen();
      const category = this.shell.settingsCategory();
      if (!open || category !== 'data') {
        return;
      }
      untracked(() => {
        void this.refreshFootprint();
      });
    });
  }

  @HostListener('window:focus')
  handleWindowFocus(): void {
    void this.refreshFootprint();
  }

  async refreshFootprint(): Promise<void> {
    try {
      const footprint = await this.desktop.api.config.workspaceFootprint();
      const tabs = this.workbench.tabCount();
      const warnAt = this.desktop.settings().tabWarnThreshold ?? 24;
      this.footprintHeavy.set(
        footprint.historyEntries > 5000
          || footprint.totalBytes > 50 * 1024 * 1024
          || tabs > warnAt,
      );
    } catch {
      this.footprintHeavy.set(false);
    }
  }

  cycleUnsaved(): void {
    const ids = this.dirtyTabs.ids();
    if (!ids.length)
      return;
    this.dirtyCursor = (this.dirtyCursor + 1) % ids.length;
    const tabId = ids[this.dirtyCursor]!;
    for (const group of this.workbench.groups()) {
      if (group.tabs.some((tab) => tab.id === tabId)) {
        this.workbench.activate(group.id, tabId);
        return;
      }
    }
  }

  openFailed(): void {
    this.shell.selectRail('history');
    this.shell.showSidebar();
    this.history.statusClasses.set(['client', 'server', 'error']);
  }

  openDataSettings(): void {
    this.shell.openSettings('data');
  }
}
