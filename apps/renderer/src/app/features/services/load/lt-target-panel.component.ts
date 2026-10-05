import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
  emptyLoadHeaderRow,
  encodeRequestBody,
  HTTP_METHODS,
  requestConfigOf,
  type CollectionNode,
  type LoadHeaderRow,
} from '@testrix/contracts';
import { TxButtonComponent, TxEmptyStateComponent, TxInputComponent, TxSelectComponent } from '@testrix/ui';

import {
  buildTargetTreeRows,
  collectFolderIds,
  filterCollectionHttpTree,
  findHttpRequest,
  type LtTargetTreeRow,
} from './lt-target-tree';

export interface LtTargetPatch {
  readonly targetSource?: 'collection' | 'manual';
  readonly targetRequestId?: string;
  readonly method?: string;
  readonly url?: string;
  readonly headers?: readonly LoadHeaderRow[];
  readonly body?: string;
  readonly environmentId?: string | null;
}

@Component({
  selector: 'tx-lt-target-panel',
  standalone: true,
  imports: [TxButtonComponent, TxEmptyStateComponent, TxInputComponent, TxSelectComponent],
  templateUrl: './lt-target-panel.component.html',
  styleUrl: './lt-target-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LtTargetPanelComponent {
  readonly targetSource = input<'collection' | 'manual'>('manual');
  readonly targetRequestId = input('');
  readonly method = input('GET');
  readonly url = input('');
  readonly headers = input<readonly LoadHeaderRow[]>([]);
  readonly body = input('');
  readonly environmentId = input<string | null>(null);
  readonly collectionTree = input<readonly CollectionNode[]>([]);
  readonly envOptions = input<readonly { readonly value: string; readonly label: string }[]>([]);

  readonly patch = output<LtTargetPatch>();

  readonly search = signal('');
  readonly expandedIds = signal<readonly string[]>([]);

  readonly methodOptions = HTTP_METHODS.map((value) => ({ value, label: value }));

  readonly sourceOptions = [
    { value: 'manual', label: 'Manual HTTP' },
    { value: 'collection', label: 'Collection request' },
  ];

  readonly displayTree = computed(() => filterCollectionHttpTree(this.collectionTree(), this.search()));

  readonly rows = computed((): readonly LtTargetTreeRow[] =>
    buildTargetTreeRows({
      nodes: this.displayTree(),
      expandedIds: new Set(this.expandedIds()),
    }),
  );

  readonly selectedRequestName = computed(() => {
    const id = this.targetRequestId();
    if (!id)
      return null;
    return findHttpRequest(this.collectionTree(), id)?.name ?? id;
  });

  handleSource(value: string): void {
    this.patch.emit({ targetSource: value === 'collection' ? 'collection' : 'manual' });
  }

  handleEnv(value: string): void {
    this.patch.emit({ environmentId: value || null });
  }

  handleSearch(value: string): void {
    this.search.set(value);
  }

  handleExpandAll(expand: boolean): void {
    this.expandedIds.set(expand ? collectFolderIds(this.displayTree()) : []);
  }

  handleToggleExpand(folderId: string): void {
    const current = this.expandedIds();
    this.expandedIds.set(
      current.includes(folderId) ? current.filter((id) => id !== folderId) : [...current, folderId],
    );
  }

  handleSelectRequest(row: LtTargetTreeRow): void {
    if (row.kind !== 'http')
      return;
    const request = findHttpRequest(this.collectionTree(), row.id);
    if (!request)
      return;
    const config = requestConfigOf(request);
    const encoded = encodeRequestBody(config.body);
    this.patch.emit({
      targetSource: 'collection',
      targetRequestId: request.id,
      method: request.method,
      url: config.url || '',
      headers: config.headers.map((row) => ({
        key: row.key,
        value: row.value,
        enabled: row.enabled !== false,
      })),
      body: encoded.text,
    });
  }

  handleMethod(value: string): void {
    this.patch.emit({ method: value });
  }

  handleUrl(value: string): void {
    this.patch.emit({ url: value });
  }

  handleBody(value: string): void {
    this.patch.emit({ body: value });
  }

  handleAddHeader(): void {
    this.patch.emit({ headers: [...this.headers(), emptyLoadHeaderRow()] });
  }

  handleHeaderKey(index: number, key: string): void {
    this.patch.emit({
      headers: this.headers().map((row, i) => (i === index ? { ...row, key } : row)),
    });
  }

  handleHeaderValue(index: number, value: string): void {
    this.patch.emit({
      headers: this.headers().map((row, i) => (i === index ? { ...row, value } : row)),
    });
  }

  handleHeaderEnabled(index: number, enabled: boolean): void {
    this.patch.emit({
      headers: this.headers().map((row, i) => (i === index ? { ...row, enabled } : row)),
    });
  }

  handleRemoveHeader(index: number): void {
    this.patch.emit({ headers: this.headers().filter((_row, i) => i !== index) });
  }

  isExpanded(id: string): boolean {
    return this.expandedIds().includes(id);
  }
}
