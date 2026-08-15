import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { EnvironmentsService } from '@app/core/environments/environments.service';
import { ElectronService } from '@app/core/electron/electron.service';
import { TxNotificationService } from '@app/core/notifications/tx-notification.service';
import { findScopeNodeLocation } from '@app/features/shell/environments/environment-profile.utils';
import { TxFormFieldComponent } from '@app/shared/components/forms/tx-form-field/tx-form-field.component';
import { TxIconComponent } from '@app/shared/components/forms/tx-icon/tx-icon.component';
import { TxInputComponent } from '@app/shared/components/forms/tx-input/tx-input.component';
import { TxTextareaComponent } from '@app/shared/components/forms/tx-textarea/tx-textarea.component';
import { TxToggleComponent } from '@app/shared/components/forms/tx-toggle/tx-toggle.component';
import { TxTooltipDirective } from '@app/shared/components/overlays/tx-tooltip/tx-tooltip.directive';
import { TxVariableInputComponent } from '@app/shared/components/editors/tx-variable-input/tx-variable-input.component';

import { ENVIRONMENT_VALUE_HINT_TOOLTIP } from './environment-value-hint';

const SAVE_DEBOUNCE_MS = 300;

@Component({
  selector: 'app-environment-variable-editor',
  standalone: true,
  imports: [
    FormsModule,
    TxFormFieldComponent,
    TxIconComponent,
    TxInputComponent,
    TxTextareaComponent,
    TxToggleComponent,
    TxVariableInputComponent,
    TxTooltipDirective,
  ],
  templateUrl: './environment-variable-editor.component.html',
  styleUrl: './environment-variable-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnvironmentVariableEditorComponent {
  private readonly environmentsService = inject(EnvironmentsService);
  private readonly electron = inject(ElectronService);
  private readonly notifications = inject(TxNotificationService);

  readonly variableId = input.required<string>();

  readonly keyRenamed = output<string>();

  protected readonly key = signal('');
  protected readonly value = signal('');
  protected readonly description = signal('');
  protected readonly secret = signal(false);
  protected readonly vaultAvailable = signal(true);

  protected readonly valueHintTooltip = ENVIRONMENT_VALUE_HINT_TOOLTIP;
  protected readonly showValue = signal(false);

  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private syncingFromStore = false;
  private lastVariableId: string | null = null;

  protected readonly title = computed(() => this.variableMeta()?.key ?? 'Variable');

  private readonly variableMeta = computed(() => {
    const loc = findScopeNodeLocation(this.environmentsService.environments(), this.variableId());
    if (!loc || loc.node.data?.kind !== 'variable') {
      return null;
    }
    return {
      key: loc.node.data.key ?? loc.node.label,
      value: loc.node.data.value ?? '',
      description: loc.node.data.description ?? '',
      secret: loc.node.data.secret ?? false,
    };
  });

  constructor() {
    effect(() => {
      const variableId = this.variableId();
      if (variableId !== this.lastVariableId) {
        this.lastVariableId = variableId;
        this.showValue.set(false);
      }
    });

    effect(() => {
      const meta = this.variableMeta();
      if (!meta) {
        return;
      }
      this.syncingFromStore = true;
      this.key.set(meta.key);
      this.value.set(meta.value);
      this.description.set(meta.description);
      this.secret.set(meta.secret);
      this.syncingFromStore = false;
    });

    void this.electron.bridge()?.config.vaultEncryptionAvailable?.().then((available) => {
      this.vaultAvailable.set(available);
    });
  }

  protected handleKeyChange(next: string): void {
    this.key.set(next);
    this.scheduleSave({ key: next });
    this.keyRenamed.emit(next);
  }

  protected handleValueChange(next: string): void {
    this.value.set(next);
    this.scheduleSave({ value: next });
  }

  protected handleDescriptionChange(next: string): void {
    this.description.set(next);
    this.scheduleSave({ description: next });
  }

  protected handleSecretChange(next: boolean): void {
    if (next && !this.vaultAvailable()) {
      this.notifications.showError(
        'OS encryption is unavailable. Testrix will not store secrets in plaintext.',
      );
      return;
    }
    this.secret.set(next);
    this.scheduleSave({ secret: next });
  }

  protected handleToggleShowValue(): void {
    this.showValue.update((visible) => !visible);
  }

  private scheduleSave(patch: {
    readonly key?: string;
    readonly value?: string;
    readonly description?: string;
    readonly secret?: boolean;
  }): void {
    if (this.syncingFromStore) {
      return;
    }
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.environmentsService.updateVariable(this.variableId(), patch);
    }, SAVE_DEBOUNCE_MS);
  }
}
