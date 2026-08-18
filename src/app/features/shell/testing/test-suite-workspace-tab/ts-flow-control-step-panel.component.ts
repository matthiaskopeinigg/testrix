import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { DynamicVariableCatalogItem } from '@shared/dynamic-variables';
import {
  createDefaultFlowCondition,
  createDefaultForEachStepConfig,
  createDefaultIfStepConfig,
  createDefaultRetryStepConfig,
  createDefaultWhileStepConfig,
  isFlowLaneNode,
  type FlowCondition,
  type ForEachStepConfig,
  type IfStepConfig,
  type RetryStepConfig,
  type TestSuiteFlowLane,
  type TestSuiteFlowStep,
  type WhileStepConfig,
} from '@shared/testing';

import { TxBannerComponent } from '@app/shared/components/feedback/tx-banner/tx-banner.component';
import { TxButtonComponent } from '@app/shared/components/forms/tx-button/tx-button.component';
import { TxFormFieldComponent } from '@app/shared/components/forms/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/forms/tx-input/tx-input.component';
import { TxSliderComponent } from '@app/shared/components/forms/tx-slider/tx-slider.component';
import { TxVariableInputComponent } from '@app/shared/components/editors/tx-variable-input/tx-variable-input.component';

import { TsFlowConditionBuilderComponent } from './ts-flow-condition-builder.component';

@Component({
  selector: 'app-ts-flow-control-step-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxBannerComponent,
    TxButtonComponent,
    TxFormFieldComponent,
    TxInputComponent,
    TxSliderComponent,
    TxVariableInputComponent,
    TsFlowConditionBuilderComponent,
  ],
  templateUrl: './ts-flow-control-step-panel.component.html',
  styleUrl: './ts-flow-step-panel.shared.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TsFlowControlStepPanelComponent {
  readonly step = input.required<TestSuiteFlowStep>();
  readonly variableCatalog = input<readonly DynamicVariableCatalogItem[]>([]);

  readonly configChange = output<Record<string, unknown>>();
  readonly addElseIf = output<void>();
  readonly elseIfConditionChange = output<{ readonly laneId: string; readonly condition: FlowCondition }>();
  readonly environmentVariableClick = output<{ readonly key: string }>();

  protected readonly elseIfLanes = computed((): TestSuiteFlowLane[] =>
    (this.step().children ?? []).filter(
      (node): node is TestSuiteFlowLane => isFlowLaneNode(node) && node.laneKind === 'elseIf',
    ),
  );

  protected ifCfg(): IfStepConfig {
    return { ...createDefaultIfStepConfig(), ...(this.step().config ?? {}) } as IfStepConfig;
  }

  protected forEachCfg(): ForEachStepConfig {
    return { ...createDefaultForEachStepConfig(), ...(this.step().config ?? {}) } as ForEachStepConfig;
  }

  protected whileCfg(): WhileStepConfig {
    return { ...createDefaultWhileStepConfig(), ...(this.step().config ?? {}) } as WhileStepConfig;
  }

  protected retryCfg(): RetryStepConfig {
    return { ...createDefaultRetryStepConfig(), ...(this.step().config ?? {}) } as RetryStepConfig;
  }

  protected patchIf(patch: Partial<IfStepConfig>): void {
    this.configChange.emit({ ...this.ifCfg(), ...patch });
  }

  protected patchForEach(patch: Partial<ForEachStepConfig>): void {
    this.configChange.emit({ ...this.forEachCfg(), ...patch });
  }

  protected patchWhile(patch: Partial<WhileStepConfig>): void {
    this.configChange.emit({ ...this.whileCfg(), ...patch });
  }

  protected patchRetry(patch: Partial<RetryStepConfig>): void {
    this.configChange.emit({ ...this.retryCfg(), ...patch });
  }

  protected handleIfCondition(condition: FlowCondition): void {
    this.patchIf({ condition });
  }

  protected handleWhileCondition(condition: FlowCondition): void {
    this.patchWhile({ condition });
  }

  protected toNumber(value: unknown, fallback: number): number {
    const n = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(n) ? n : fallback;
  }

  protected emptyCondition(): FlowCondition {
    return createDefaultFlowCondition();
  }

  protected readonly sourcePlaceholder = '["admin","user"] or {{ids}}';
}
