import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { LoadTestScenario } from '@shared/testing';

import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxTextareaComponent } from '@app/shared/components/tx-textarea/tx-textarea.component';

@Component({
  selector: 'app-lt-tab-scenarios-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxButtonComponent,
    TxFormFieldComponent,
    TxInputComponent,
    TxTextareaComponent,
  ],
  template: `
    <div class="request-panel">
      <p class="request-panel__hint">
        Weighted scenarios override profile values when present. An empty list uses the default profile.
      </p>

      @if (scenarios().length === 0) {
        <p class="request-panel__empty">No scenarios yet.</p>
      }

      @for (scenario of scenarios(); track scenario.id) {
        <div class="lt-scenario-card">
          <tx-form-field label="Name" [controlId]="'lt-scenario-name-' + scenario.id">
            <tx-input
              [id]="'lt-scenario-name-' + scenario.id"
              [ngModel]="scenario.name"
              (ngModelChange)="handlePatch(scenario.id, { name: $event })"
            />
          </tx-form-field>

          <div class="lt-scenario-card__row">
            <tx-form-field label="Weight (%)" [controlId]="'lt-scenario-weight-' + scenario.id">
              <tx-input
                [id]="'lt-scenario-weight-' + scenario.id"
                type="number"
                min="0"
                max="100"
                [ngModel]="scenario.weight"
                (ngModelChange)="handlePatch(scenario.id, { weight: toNumber($event, scenario.weight) })"
              />
            </tx-form-field>

            <tx-form-field label="Virtual users" [controlId]="'lt-scenario-vus-' + scenario.id">
              <tx-input
                [id]="'lt-scenario-vus-' + scenario.id"
                type="number"
                min="1"
                placeholder="Profile default"
                [ngModel]="scenario.virtualUsers ?? ''"
                (ngModelChange)="handlePatch(scenario.id, { virtualUsers: toOptionalInt($event) })"
              />
            </tx-form-field>

            <tx-form-field label="Duration (s)" [controlId]="'lt-scenario-duration-' + scenario.id">
              <tx-input
                [id]="'lt-scenario-duration-' + scenario.id"
                type="number"
                min="1"
                placeholder="Profile default"
                [ngModel]="scenario.durationSec ?? ''"
                (ngModelChange)="handlePatch(scenario.id, { durationSec: toOptionalInt($event) })"
              />
            </tx-form-field>
          </div>

          <tx-form-field label="Notes" [controlId]="'lt-scenario-notes-' + scenario.id">
            <tx-textarea
              [id]="'lt-scenario-notes-' + scenario.id"
              [ngModel]="scenario.notes"
              (ngModelChange)="handlePatch(scenario.id, { notes: $event })"
            />
          </tx-form-field>

          <tx-button variant="secondary" (pressed)="removeScenario.emit(scenario.id)">
            Remove scenario
          </tx-button>
        </div>
      }

      <tx-button variant="secondary" (pressed)="addScenario.emit()">
        Add scenario
      </tx-button>
    </div>
  `,
  styleUrl: './lt-tab-panels.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LtTabScenariosPanelComponent {
  readonly scenarios = input<readonly LoadTestScenario[]>([]);

  readonly scenariosChange = output<readonly LoadTestScenario[]>();
  readonly addScenario = output<void>();
  readonly removeScenario = output<string>();

  protected handlePatch(id: string, patch: Partial<LoadTestScenario>): void {
    this.scenariosChange.emit(
      this.scenarios().map((scenario) =>
        scenario.id === id ? { ...scenario, ...patch } : scenario,
      ),
    );
  }

  protected toNumber(value: unknown, fallback: number): number {
    const parsed = Number.parseFloat(String(value ?? ''));
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  protected toOptionalInt(value: unknown): number | undefined {
    if (value === '' || value === null || value === undefined) {
      return undefined;
    }
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
}
