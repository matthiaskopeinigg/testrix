import { Injectable, computed, inject, signal } from '@angular/core';
import {
  DEFAULT_HISTORY_FILE,
  filterHistoryEntries,
  groupHistoryEntries,
  parseHistoryFile,
  prependHistoryEntry,
  type HistoryEntry,
  type HistoryFile,
  type HistoryGroup,
  type HistoryGroupBy,
  type HistoryStatusClass,
  type HttpMethod,
} from '@testrix/contracts';

/** At or above this count, default grouping is by day when no session preference exists. */
export const HISTORY_SMART_GROUP_THRESHOLD = 50;

import { DesktopApiService } from '../../core/desktop-api.service';
import { applyPointerSelect, emptySelection, type SelectionEntry } from '../../core/range-select';

@Injectable({ providedIn: 'root' })
export class HistoryStore {
  private readonly desktop = inject(DesktopApiService);
  readonly entries = signal<readonly HistoryEntry[]>([]);
  readonly searchQuery = signal('');
  readonly groupBy = signal<HistoryGroupBy>('day');
  readonly methods = signal<readonly HttpMethod[]>([]);
  readonly statusClasses = signal<readonly HistoryStatusClass[]>([]);
  readonly selectedIds = signal<readonly string[]>([]);
  readonly selectionAnchorId = signal<string | null>(null);

  readonly filtered = computed(() =>
    filterHistoryEntries(this.entries(), {
      query: this.searchQuery(),
      methods: this.methods(),
      statusClasses: this.statusClasses(),
    }),
  );

  readonly groups = computed((): readonly HistoryGroup[] =>
    groupHistoryEntries(this.filtered(), this.groupBy()),
  );

  readonly isFilterActive = computed(
    () =>
      this.searchQuery().trim().length > 0 ||
      this.methods().length > 0 ||
      this.statusClasses().length > 0,
  );

  hydrate(file: HistoryFile, rememberedGroup?: HistoryGroupBy): void {
    const entries = parseHistoryFile(file).entries;
    this.entries.set(entries);
    this.clearSelection();
    this.clearFilters();
    if (rememberedGroup) {
      this.groupBy.set(rememberedGroup);
      return;
    }
    this.groupBy.set(entries.length >= HISTORY_SMART_GROUP_THRESHOLD ? 'day' : 'status');
  }

  /** Visible entry ids in list order (grouped). */
  visibleIds(): readonly string[] {
    return this.groups().flatMap((group) => group.entries.map((entry) => entry.id));
  }

  isSelected(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  applyPointerSelect(
    targetId: string,
    event: { readonly shiftKey: boolean; readonly ctrlKey: boolean; readonly metaKey: boolean },
  ): SelectionEntry {
    const next = applyPointerSelect({
      event,
      visibleIds: this.visibleIds(),
      selectedIds: this.selectedIds(),
      anchorId: this.selectionAnchorId(),
      targetId,
    });
    this.selectedIds.set(next.ids);
    this.selectionAnchorId.set(next.anchorId);
    return next;
  }

  selectAllVisible(): void {
    const ids = this.visibleIds();
    this.selectedIds.set(ids);
    this.selectionAnchorId.set(ids[0] ?? null);
  }

  clearSelection(): void {
    const next = emptySelection();
    this.selectedIds.set(next.ids);
    this.selectionAnchorId.set(next.anchorId);
  }

  private pruneSelection(removing: ReadonlySet<string>): void {
    this.selectedIds.set(this.selectedIds().filter((id) => !removing.has(id)));
    const anchor = this.selectionAnchorId();
    if (anchor && removing.has(anchor))
      this.selectionAnchorId.set(this.selectedIds()[0] ?? null);
  }

  entryById(id: string): HistoryEntry | null {
    return this.entries().find((entry) => entry.id === id) ?? null;
  }

  ids(): ReadonlySet<string> {
    return new Set(this.entries().map((entry) => entry.id));
  }

  setSearchQuery(value: string): void {
    this.searchQuery.set(value);
  }

  setGroupBy(value: HistoryGroupBy): void {
    this.groupBy.set(value);
  }

  toggleMethod(method: HttpMethod): void {
    const current = this.methods();
    this.methods.set(
      current.includes(method) ? current.filter((item) => item !== method) : [...current, method],
    );
  }

  toggleStatusClass(value: HistoryStatusClass): void {
    const current = this.statusClasses();
    this.statusClasses.set(
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.methods.set([]);
    this.statusClasses.set([]);
  }

  async append(entry: HistoryEntry): Promise<void> {
    const next = prependHistoryEntry(
      parseHistoryFile({ schemaVersion: DEFAULT_HISTORY_FILE.schemaVersion, entries: [...this.entries()] }),
      entry,
    );
    this.entries.set(next.entries);
    await this.desktop.saveHistory({ entries: next.entries });
  }

  async remove(id: string): Promise<void> {
    await this.removeMany([id]);
  }

  async removeMany(ids: readonly string[]): Promise<void> {
    if (ids.length === 0)
      return;
    const removing = new Set(ids);
    const next = this.entries().filter((entry) => !removing.has(entry.id));
    if (next.length === this.entries().length)
      return;
    this.entries.set(next);
    this.pruneSelection(removing);
    await this.desktop.saveHistory({ entries: next });
  }

  async clear(): Promise<void> {
    this.entries.set([]);
    this.clearSelection();
    await this.desktop.saveHistory({ entries: [] });
  }

  /** Drops entries older than the given number of days. */
  async removeOlderThanDays(days: number): Promise<void> {
    if (days <= 0)
      return;
    const cutoff = Date.now() - days * 86_400_000;
    const next = this.entries().filter((entry) => {
      const at = Date.parse(entry.at);
      return Number.isFinite(at) && at >= cutoff;
    });
    if (next.length === this.entries().length)
      return;
    const keep = new Set(next.map((entry) => entry.id));
    const removing = new Set(this.entries().filter((entry) => !keep.has(entry.id)).map((entry) => entry.id));
    this.entries.set(next);
    this.pruneSelection(removing);
    await this.desktop.saveHistory({ entries: next });
  }
}