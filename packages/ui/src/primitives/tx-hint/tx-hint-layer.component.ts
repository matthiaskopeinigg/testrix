import { afterRenderEffect, ChangeDetectionStrategy, Component, ElementRef, inject } from '@angular/core';

import { TxHintLayerService } from './tx-hint-layer.service';
import { fitHintInViewport } from './tx-hint-position';

@Component({
  selector: 'tx-hint-layer',
  standalone: true,
  templateUrl: './tx-hint-layer.component.html',
  styleUrl: './tx-hint-layer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxHintLayerComponent {
  readonly layer = inject(TxHintLayerService);
  private readonly host = inject(ElementRef<HTMLElement>);

  constructor() {
    afterRenderEffect(() => {
      const hint = this.layer.active();
      if (!hint)
        return;
      const bubble = this.host.nativeElement.querySelector('.tx-hint-layer__bubble');
      if (!(bubble instanceof HTMLElement))
        return;
      const box = bubble.getBoundingClientRect();
      const vw = window.visualViewport?.width ?? window.innerWidth;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const next = fitHintInViewport(hint.x, hint.y, box.width, box.height, vw, vh);
      if (Math.abs(next.x - hint.x) < 0.5 && Math.abs(next.y - hint.y) < 0.5)
        return;
      this.layer.show({ ...hint, x: next.x, y: next.y });
    });
  }
}
