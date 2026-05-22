import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ConfigService } from '@app/core/config/config.service';
import { TxDropdownComponent } from '@app/shared/components/tx-dropdown/tx-dropdown.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxTextareaComponent } from '@app/shared/components/tx-textarea/tx-textarea.component';

@Component({
  selector: 'app-ts-flow-database-step-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxInputComponent,
    TxTextareaComponent,
  ],
  templateUrl: './ts-flow-database-step-panel.component.html',
  styleUrl: './ts-flow-step-panel.shared.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TsFlowDatabaseStepPanelComponent {
  readonly config = input<Record<string, unknown>>({});

  readonly configChange = output<Record<string, unknown>>();

  private readonly configService = inject(ConfigService);

  protected readonly connectionOptions = computed(() => {
    const connections = this.configService.settings()?.databases?.connections ?? [];
    return connections.map((conn) => ({
      value: conn.id,
      label: `${conn.name} (${conn.type})`,
    }));
  });

  protected readonly hasConnections = computed(() => this.connectionOptions().length > 0);

  protected readonly queryPlaceholder = 'SELECT * FROM users WHERE id = {{userId}}';

  protected cfg(): { connectionId: string; query: string; cacheAs?: string } {
    return (this.config() ?? { connectionId: '', query: '' }) as {
      connectionId: string;
      query: string;
      cacheAs?: string;
    };
  }

  protected patch(patch: Record<string, unknown>): void {
    this.configChange.emit({ ...this.cfg(), ...patch });
  }
}
