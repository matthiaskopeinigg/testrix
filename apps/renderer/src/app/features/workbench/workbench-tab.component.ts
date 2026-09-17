import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { parseDatabaseConnectionTabNodeId, parseDatabaseDiagramTabNodeId, parseDatabaseQueryTabNodeId, parseDatabaseTableTabNodeId } from '@testrix/contracts';
import { TxHintComponent } from '@testrix/ui';

import { DatabaseStore } from '../database/database.store';
import { DatabaseTypeIconComponent } from '../database/database-type-icon.component';
import { ToolIconComponent } from '../tools/tool-icon.component';
import type { WorkbenchTab } from './workbench.store';

export function httpMethodLabel(method: string | null | undefined): string {
  if (method === 'DELETE') {
    return 'DEL';
  }
  if (method === 'OPTIONS') {
    return 'OPT';
  }
  return method ?? '';
}

@Component({
  selector: 'tx-workbench-tab',
  standalone: true,
  imports: [TxHintComponent, ToolIconComponent, DatabaseTypeIconComponent],
  templateUrl: './workbench-tab.component.html',
  styleUrl: './workbench-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkbenchTabComponent {
  readonly tab = input.required<WorkbenchTab>();
  readonly active = input(false);
  readonly selected = input(false);
  readonly justOpened = input(false);
  readonly select = output<{ readonly tabId: string; readonly event: MouseEvent | KeyboardEvent }>();
  readonly close = output<string>();
  readonly menu = output<{ readonly tabId: string; readonly event: MouseEvent }>();
  private readonly database = inject(DatabaseStore);

  readonly engineType = computed(() => {
    const tab = this.tab();
    if (tab.kind === 'database-connection') {
      const id = parseDatabaseConnectionTabNodeId(tab.nodeId);
      return id ? this.database.connectionById(id)?.type ?? null : null;
    }
    if (tab.kind === 'database-query') {
      const id = parseDatabaseQueryTabNodeId(tab.nodeId);
      const query = id ? this.database.queryById(id) : null;
      return query?.connectionId ? this.database.connectionById(query.connectionId)?.type ?? null : null;
    }
    if (tab.kind === 'database-table') {
      const target = parseDatabaseTableTabNodeId(tab.nodeId);
      return target ? this.database.connectionById(target.connectionId)?.type ?? null : null;
    }
    if (tab.kind === 'database-diagram') {
      const target = parseDatabaseDiagramTabNodeId(tab.nodeId);
      return target ? this.database.connectionById(target.connectionId)?.type ?? null : null;
    }
    return null;
  });

  readonly ariaLabel = computed(() => {
    const tab = this.tab();
    if (tab.kind === 'http' && tab.method) {
      return `${tab.method} ${tab.title}`;
    }
    if (tab.kind === 'environment') {
      return `Environment ${tab.title}`;
    }
    if (tab.kind === 'tool') {
      return tab.title;
    }
    if (tab.kind === 'database-connection') {
      return `Connection ${tab.title}`;
    }
    if (tab.kind === 'database-query') {
      return `Query ${tab.title}`;
    }
    if (tab.kind === 'database-table') {
      return `Table ${tab.title}`;
    }
    if (tab.kind === 'database-diagram') {
      return `Diagram ${tab.title}`;
    }
    return `WebSocket ${tab.title}`;
  });

  readonly methodLabel = computed(() => httpMethodLabel(this.tab().method));

  handleSelect(event: MouseEvent): void {
    this.select.emit({ tabId: this.tab().id, event });
  }

  handleClose(event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();
    this.close.emit(this.tab().id);
  }

  handleContextMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.menu.emit({ tabId: this.tab().id, event });
  }

  handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.select.emit({ tabId: this.tab().id, event });
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.close.emit(this.tab().id);
    }
  }
}
