import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, inject, input, output } from '@angular/core';

import { TxButtonComponent } from '../../primitives/tx-button/tx-button.component';
import { TxOverlayHostDirective } from '../tx-overlay-host.directive';
import { TxOverlayComponent } from '../tx-overlay/tx-overlay.component';

let confirmUid = 0;

@Component({
  selector: 'tx-confirm-dialog',
  standalone: true,
  imports: [TxOverlayComponent, TxButtonComponent],
  templateUrl: './tx-confirm-dialog.component.html',
  styleUrl: './tx-confirm-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [TxOverlayHostDirective],
})
export class TxConfirmDialogComponent {
  readonly title = input.required<string>();
  readonly body = input.required<string>();
  readonly confirmLabel = input('Delete');
  readonly cancelLabel = input('Cancel');
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  readonly titleId = `tx-confirm-title-${++confirmUid}`;
  private readonly host = inject(ElementRef<HTMLElement>);

  constructor() {
    afterNextRender(() => {
      const cancel = this.host.nativeElement.querySelector('.tx-confirm__cancel button');
      if (cancel instanceof HTMLElement) {
        cancel.focus();
      }
    });
  }
}
