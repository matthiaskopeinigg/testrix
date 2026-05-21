import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { HttpResponseSnapshot } from '@shared/http/outgoing-request.schema';

import { TxIconComponent } from '../tx-icon/tx-icon.component';

@Component({
  selector: 'tx-run-timeline',
  standalone: true,
  imports: [TxIconComponent],
  template: `
    <div class="tx-run-timeline" role="list" aria-label="Response runs">
      @for (run of runs(); track run.id) {
        <button
          type="button"
          class="tx-run-timeline__chip"
          role="listitem"
          [class.is-active]="selectedId() === run.id"
          [class.is-pinned]="pinnedId() === run.id"
          [attr.aria-pressed]="selectedId() === run.id"
          [title]="pinnedId() === run.id ? 'Pinned baseline' : 'Select run (Shift+click to compare)'"
          (click)="handleClick(run.id, $event)"
        >
          @if (pinnedId() === run.id) {
            <tx-icon name="star" [size]="12" class="tx-run-timeline__pin" aria-hidden="true" />
          } @else {
            <span
              class="tx-run-timeline__dot"
              [class.is-ok]="run.status.ok"
              [class.is-error]="!run.status.ok"
            ></span>
          }
          <span>{{ run.status.code }}</span>
          <span class="tx-run-timeline__time">{{ run.timing.totalMs }}ms</span>
        </button>
      }
    </div>
  `,
  styleUrl: './tx-run-timeline.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxRunTimelineComponent {
  readonly runs = input<readonly HttpResponseSnapshot[]>([]);
  readonly selectedId = input<string | null>(null);
  readonly pinnedId = input<string | null>(null);
  readonly selectedIdChange = output<string>();
  readonly compareRuns = output<{ readonly a: string; readonly b: string }>();

  protected handleClick(id: string, event: MouseEvent): void {
    const anchor = this.selectedId();
    if (event.shiftKey && anchor && anchor !== id) {
      this.compareRuns.emit({ a: id, b: anchor });
      return;
    }
    this.selectedIdChange.emit(id);
  }
}
