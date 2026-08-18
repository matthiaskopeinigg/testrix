import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import type { TestSuiteFlowNode, TestSuiteStepStatus } from '@shared/testing';

import { TxButtonComponent } from '@app/shared/components/forms/tx-button/tx-button.component';
import { TxIconComponent } from '@app/shared/components/forms/tx-icon/tx-icon.component';

import { layoutFlowStepDiagram } from './flow-step-diagram.layout';

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2.5;

@Component({
  selector: 'app-ts-flow-step-diagram',
  standalone: true,
  imports: [TxButtonComponent, TxIconComponent],
  templateUrl: './ts-flow-step-diagram.component.html',
  styleUrl: './ts-flow-step-diagram.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TsFlowStepDiagramComponent {
  private readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');

  readonly nodes = input<readonly TestSuiteFlowNode[]>([]);
  readonly liveStepStatuses = input<Readonly<Record<string, TestSuiteStepStatus>>>({});
  readonly selectedStepId = input<string | null>(null);

  readonly selectedStepIdChange = output<string | null>();

  protected readonly layout = computed(() => layoutFlowStepDiagram(this.nodes()));
  protected readonly scale = signal(1);
  protected readonly panX = signal(16);
  protected readonly panY = signal(16);

  protected readonly zoomPercent = computed(() => Math.round(this.scale() * 100));
  protected readonly worldTransform = computed(
    () => `translate(${this.panX()}px, ${this.panY()}px) scale(${this.scale()})`,
  );

  private dragging = false;
  private dragMoved = false;
  private dragLastX = 0;
  private dragLastY = 0;
  private fitted = false;

  constructor() {
    afterNextRender(() => {
      if (!this.fitted && this.layout().nodes.length > 0) {
        this.fitted = true;
        this.handleFit();
      }
    });
  }

  protected handleNodeClick(id: string, selectable: boolean, event: Event): void {
    event.stopPropagation();
    if (!selectable || this.dragMoved) {
      return;
    }
    this.selectedStepIdChange.emit(id);
  }

  protected handleZoomIn(): void {
    this.zoomAt(this.viewportCenter(), Math.min(ZOOM_MAX, this.scale() * 1.2));
  }

  protected handleZoomOut(): void {
    this.zoomAt(this.viewportCenter(), Math.max(ZOOM_MIN, this.scale() / 1.2));
  }

  protected handleFit(): void {
    const viewport = this.viewport()?.nativeElement;
    const layout = this.layout();
    if (!viewport || layout.nodes.length === 0 || viewport.clientWidth < 8 || viewport.clientHeight < 8) {
      this.scale.set(1);
      this.panX.set(16);
      this.panY.set(16);
      return;
    }
    const next = Math.min(1, (viewport.clientWidth - 24) / layout.width, (viewport.clientHeight - 24) / layout.height);
    this.scale.set(clampZoom(next));
    this.panX.set((viewport.clientWidth - layout.width * this.scale()) / 2);
    this.panY.set(Math.max(12, (viewport.clientHeight - layout.height * this.scale()) / 2));
  }

  protected handleWheel(event: WheelEvent): void {
    event.preventDefault();
    const viewport = this.viewport()?.nativeElement;
    if (!viewport) {
      return;
    }
    const rect = viewport.getBoundingClientRect();
    const next = clampZoom(this.scale() * Math.exp(-event.deltaY * 0.0018));
    this.zoomAt({ x: event.clientX - rect.left, y: event.clientY - rect.top }, next);
  }

  protected handlePointerDown(event: PointerEvent): void {
    this.dragMoved = false;
    if (event.button !== 0) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest('.ts-flow-step-diagram__node.is-selectable')) {
      this.dragging = false;
      this.dragMoved = false;
      return;
    }
    this.dragging = true;
    this.dragMoved = false;
    this.dragLastX = event.clientX;
    this.dragLastY = event.clientY;
    this.viewport()?.nativeElement.setPointerCapture(event.pointerId);
  }

  protected handlePointerMove(event: PointerEvent): void {
    if (!this.dragging) {
      return;
    }
    const dx = event.clientX - this.dragLastX;
    const dy = event.clientY - this.dragLastY;
    if (Math.abs(dx) + Math.abs(dy) > 3) {
      this.dragMoved = true;
    }
    this.dragLastX = event.clientX;
    this.dragLastY = event.clientY;
    this.panX.update((x) => x + dx);
    this.panY.update((y) => y + dy);
  }

  protected handlePointerUp(event: PointerEvent): void {
    if (this.dragging) {
      this.viewport()?.nativeElement.releasePointerCapture(event.pointerId);
    }
    this.dragging = false;
  }

  private viewportCenter(): { readonly x: number; readonly y: number } {
    const viewport = this.viewport()?.nativeElement;
    if (!viewport) {
      return { x: 0, y: 0 };
    }
    return { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 };
  }

  private zoomAt(point: { readonly x: number; readonly y: number }, nextScale: number): void {
    const current = this.scale();
    if (current === nextScale) {
      return;
    }
    const worldX = (point.x - this.panX()) / current;
    const worldY = (point.y - this.panY()) / current;
    this.scale.set(nextScale);
    this.panX.set(point.x - worldX * nextScale);
    this.panY.set(point.y - worldY * nextScale);
  }
}

function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}
