import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  type ElementRef,
  inject,
  viewChild,
} from '@angular/core';

import { TxDndService } from './tx-dnd.service';

/**
 * Single floating layer for the active drag preview. Mount it once, at the root of the shell.
 *
 * Each nesting level owns exactly one transform: the root follows the pointer, the settle
 * wrapper is reserved for the release flight, and the chip carries the velocity tilt.
 * Keeping them separate is what stops a preview from snapping to the corner of the screen.
 */
@Component({
  selector: 'tx-drag-layer',
  standalone: true,
  imports: [NgTemplateOutlet],
  templateUrl: './tx-drag-layer.component.html',
  styleUrl: './tx-drag-layer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxDragLayerComponent {
  readonly dnd = inject(TxDndService);

  /** Non-null only while there is something to show. */
  readonly template = computed(() => (this.dnd.layerVisible() ? this.dnd.previewTemplate() : null));
  readonly width = computed(() => this.dnd.origin()?.rect.width ?? null);

  private readonly rootRef = viewChild<ElementRef<HTMLElement>>('root');
  private readonly settleRef = viewChild<ElementRef<HTMLElement>>('settle');
  private readonly chipRef = viewChild<ElementRef<HTMLElement>>('chip');

  constructor() {
    effect(() => {
      const root = this.rootRef();
      const settle = this.settleRef();
      const chip = this.chipRef();

      if (!root || !settle || !chip) {
        this.dnd.detachLayer();
        return;
      }

      this.dnd.attachLayer({
        root: root.nativeElement,
        settle: settle.nativeElement,
        chip: chip.nativeElement,
      });
    });
  }
}
