import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { TestSuiteTreeItem } from '@shared/testing';

import { TxDropdownComponent } from '@app/shared/components/forms/tx-dropdown/tx-dropdown.component';
import { TxFormFieldComponent } from '@app/shared/components/forms/tx-form-field/tx-form-field.component';
import { TxTreeSelectComponent } from '@app/shared/components/forms/tx-tree-select/tx-tree-select.component';

import { FLOW_STEP_TRIGGER_TARGET_OPTIONS } from './flow-step-editor-options';
import { buildTriggerTargetTree } from './flow-step-picker-options';

/** TRIGGER step editor: target type plus searchable flow/folder tree. */
@Component({
  selector: 'app-ts-flow-trigger-step-panel',
  standalone: true,
  imports: [FormsModule, TxFormFieldComponent, TxDropdownComponent, TxTreeSelectComponent],
  templateUrl: './ts-flow-trigger-step-panel.component.html',
  styleUrl: './ts-flow-step-panel.shared.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TsFlowTriggerStepPanelComponent {
  /** Persisted TRIGGER config (`targetType`, `targetId`). */
  readonly config = input<Record<string, unknown>>({});
  /** Suite sidebar tree used to pick a flow or folder. */
  readonly suiteItems = input<readonly TestSuiteTreeItem[]>([]);
  /** Current flow id so the picker can omit a self-trigger. */
  readonly currentFlowId = input('');

  readonly configChange = output<Record<string, unknown>>();

  protected readonly targetTypeOptions = FLOW_STEP_TRIGGER_TARGET_OPTIONS;

  protected readonly targetType = computed<'flow' | 'folder'>(() => {
    const value = (this.config() as { targetType?: string }).targetType;
    return value === 'folder' ? 'folder' : 'flow';
  });

  protected readonly targetId = computed(() =>
    String((this.config() as { targetId?: string }).targetId ?? ''),
  );

  protected readonly targetTree = computed(() =>
    buildTriggerTargetTree(this.suiteItems(), this.targetType(), this.currentFlowId()),
  );

  protected readonly selectMode = computed(() =>
    this.targetType() === 'folder' ? 'folder' : 'leaf',
  );

  protected cfg(): { targetType: string; targetId: string } {
    return {
      targetType: this.targetType(),
      targetId: this.targetId(),
    };
  }

  protected patch(patch: Record<string, unknown>): void {
    this.configChange.emit({ ...this.cfg(), ...patch });
  }
}
