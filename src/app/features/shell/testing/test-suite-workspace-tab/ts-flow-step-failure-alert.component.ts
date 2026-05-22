import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';

@Component({
  selector: 'app-ts-flow-step-failure-alert',
  standalone: true,
  imports: [TxButtonComponent, TxIconComponent],
  template: `
    <aside class="ts-flow-step-failure-callout" role="alert" aria-live="assertive">
      <div class="ts-flow-step-failure-callout__accent" aria-hidden="true"></div>

      <div class="ts-flow-step-failure-callout__body">
        <header class="ts-flow-step-failure-callout__head">
          <span class="ts-flow-step-failure-callout__icon" aria-hidden="true">
            <tx-icon name="alertCircle" [size]="20" />
          </span>

          <div class="ts-flow-step-failure-callout__titles">
            <p class="ts-flow-step-failure-callout__eyebrow">Step failed</p>
            <h3 class="ts-flow-step-failure-callout__name">{{ stepName() }}</h3>
          </div>

          <tx-button
            variant="secondary"
            size="icon"
            ariaLabel="Dismiss error"
            (pressed)="dismissed.emit()"
          >
            <tx-icon name="close" [size]="14" aria-hidden="true" />
          </tx-button>
        </header>

        @if (message()) {
          <p class="ts-flow-step-failure-callout__message">{{ message() }}</p>
        }
      </div>
    </aside>
  `,
  styleUrl: './ts-flow-step-failure-alert.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TsFlowStepFailureAlertComponent {
  readonly stepName = input.required<string>();
  readonly message = input<string | null>(null);
  readonly dismissed = output<void>();
}
