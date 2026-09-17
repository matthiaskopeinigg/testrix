import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { parseDatabaseDiagramTabNodeId } from '@testrix/contracts';
import { TxSpinnerComponent } from '@testrix/ui';

import { WorkbenchStore, type WorkbenchTab } from '../workbench/workbench.store';
import { applyErdPositions, layoutErd, type ErdLayoutNode } from './database-erd-layout';
import { catalogTableKey } from './database-nav';
import { DatabaseStore } from './database.store';

const NODE_DRAG_THRESHOLD = 4;

interface ErdNodeDrag {
  readonly id: string;
  readonly startX: number;
  readonly startY: number;
  readonly origX: number;
  readonly origY: number;
  moved: boolean;
}

@Component({
  selector: 'tx-database-erd',
  standalone: true,
  imports: [TxSpinnerComponent],
  templateUrl: './database-erd.component.html',
  styleUrl: './database-erd.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatabaseErdComponent {
  readonly tab = input.required<WorkbenchTab>();

  private readonly store = inject(DatabaseStore);
  private readonly workbench = inject(WorkbenchStore);
  readonly scale = signal(1);
  readonly panX = signal(24);
  readonly panY = signal(24);
  readonly draggingId = signal<string | null>(null);
  readonly positions = signal<Readonly<Record<string, { readonly x: number; readonly y: number }>>>({});
  private panning = false;
  private panOrigin = { x: 0, y: 0, panX: 0, panY: 0 };
  private nodeDrag: ErdNodeDrag | null = null;

  readonly target = computed(() => parseDatabaseDiagramTabNodeId(this.tab().nodeId));
  readonly connectionId = computed(() => this.target()?.connectionId ?? '');
  readonly schema = computed(() => this.target()?.schema ?? '');

  readonly busy = computed(() => {
    const target = this.target();
    return target ? this.store.isCatalogBusy(this.store.schemaBusyKey(target.connectionId, target.schema)) : false;
  });

  readonly layout = computed(() => {
    const target = this.target();
    if (!target)
      return layoutErd({ schema: '', tables: [], foreignKeys: [], pkByTable: {} });
    const cache = this.store.catalogByConnection()[target.connectionId];
    const schema = target.schema;
    const tables = cache?.tablesBySchema[schema] ?? [];
    const foreignKeys = cache?.foreignKeysBySchema[schema] ?? [];
    const pkByTable: Record<string, string[]> = {};
    for (const table of tables) {
      const key = catalogTableKey(schema, table.name);
      pkByTable[key] = (cache?.columnsByTable[key] ?? [])
        .filter((column) => column.primaryKey)
        .map((column) => column.name);
    }
    return layoutErd({ schema, tables, foreignKeys, pkByTable });
  });

  readonly displayLayout = computed(() => applyErdPositions(this.layout(), this.positions()));

  readonly transform = computed(
    () => `translate(${this.panX()} ${this.panY()}) scale(${this.scale()})`,
  );

  constructor() {
    effect(() => {
      const target = this.target();
      if (target)
        void this.store.loadSchemaObjects(target.connectionId, target.schema);
    });
    effect(() => {
      const nodeId = this.tab().nodeId;
      const saved = this.store.readErdPositions(nodeId);
      untracked(() => this.positions.set({ ...saved }));
    });
  }

  handleWheel(event: WheelEvent): void {
    event.preventDefault();
    const current = event.currentTarget;
    if (!(current instanceof HTMLElement))
      return;
    const rect = current.getBoundingClientRect();
    const cx = event.clientX - rect.left;
    const cy = event.clientY - rect.top;
    const scale = this.scale();
    const next = Math.min(2.6, Math.max(0.35, scale * (event.deltaY > 0 ? 0.9 : 1.1)));
    const wx = (cx - this.panX()) / scale;
    const wy = (cy - this.panY()) / scale;
    this.scale.set(next);
    this.panX.set(cx - wx * next);
    this.panY.set(cy - wy * next);
  }

  handlePanStart(event: PointerEvent): void {
    if (event.button !== 0)
      return;
    const target = event.target;
    if (target instanceof Element && target.closest('[data-erd-node]'))
      return;
    if (!(event.currentTarget instanceof HTMLElement))
      return;
    this.panning = true;
    this.panOrigin = { x: event.clientX, y: event.clientY, panX: this.panX(), panY: this.panY() };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  handlePanMove(event: PointerEvent): void {
    const drag = this.nodeDrag;
    if (drag) {
      const dx = (event.clientX - drag.startX) / this.scale();
      const dy = (event.clientY - drag.startY) / this.scale();
      if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= NODE_DRAG_THRESHOLD)
        drag.moved = true;
      if (!drag.moved)
        return;
      this.positions.update((current) => ({
        ...current,
        [drag.id]: { x: drag.origX + dx, y: drag.origY + dy },
      }));
      return;
    }
    if (!this.panning)
      return;
    this.panX.set(this.panOrigin.panX + event.clientX - this.panOrigin.x);
    this.panY.set(this.panOrigin.panY + event.clientY - this.panOrigin.y);
  }

  handlePanEnd(): void {
    const drag = this.nodeDrag;
    this.panning = false;
    this.nodeDrag = null;
    this.draggingId.set(null);
    if (!drag)
      return;
    if (drag.moved)
      this.store.writeErdPositions(this.tab().nodeId, this.positions());
    else
      this.openNode(drag.id);
  }

  handleNodeDown(event: PointerEvent, node: ErdLayoutNode): void {
    if (event.button !== 0)
      return;
    event.stopPropagation();
    event.preventDefault();
    const canvas = event.currentTarget instanceof Element
      ? event.currentTarget.closest('.tx-db-erd__canvas')
      : null;
    if (canvas instanceof HTMLElement)
      canvas.setPointerCapture(event.pointerId);
    this.nodeDrag = {
      id: node.id,
      startX: event.clientX,
      startY: event.clientY,
      origX: node.x,
      origY: node.y,
      moved: false,
    };
    this.draggingId.set(node.id);
  }

  ticks(node: ErdLayoutNode): readonly { readonly name: string; readonly kind: 'pk' | 'fk' }[] {
    const seen = new Set<string>();
    const out: { name: string; kind: 'pk' | 'fk' }[] = [];
    for (const name of node.pkColumns) {
      if (!name || seen.has(name))
        continue;
      seen.add(name);
      out.push({ name, kind: 'pk' });
    }
    for (const name of node.fkColumns) {
      if (!name || seen.has(name))
        continue;
      seen.add(name);
      out.push({ name, kind: 'fk' });
    }
    return out;
  }

  private openNode(nodeId: string): void {
    const target = this.target();
    const node = this.displayLayout().nodes.find((item) => item.id === nodeId);
    if (!target || !node)
      return;
    this.workbench.openFromDatabaseTable(
      { connectionId: target.connectionId, schema: node.schema, table: node.table },
      node.schema ? `${node.schema}.${node.table}` : node.table,
    );
  }
}
