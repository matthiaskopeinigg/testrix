import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { getEnvironmentDefinition } from '@shared/config';
import type { TestSuiteFlow, TestSuiteFlowStep } from '@shared/testing';
import { resolveFlowStepRunError } from '@shared/testing';

import { ConfigService } from '@app/core/config/config.service';
import { EnvironmentsService } from '@app/core/environments/environments.service';

import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import type { TxIconName } from '@app/shared/icons';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxTextareaComponent } from '@app/shared/components/tx-textarea/tx-textarea.component';
import { TxToggleComponent } from '@app/shared/components/tx-toggle/tx-toggle.component';

import { collectPriorFlowPlaceholderKeys } from './flow-step-variable-catalog';
import { buildTriggerTargetOptions, buildValidationRefStepOptions } from './flow-step-picker-options';
import {
  FLOW_STEP_ADD_ICONS,
  FLOW_STEP_GUIDED_TITLES,
  flowStepHasCustomName,
  flowStepTypeAccentToken,
} from './flow-step-labels';
import { TsFlowDatabaseStepPanelComponent } from './ts-flow-database-step-panel.component';
import { TsFlowE2eStepPanelComponent } from './ts-flow-e2e-step-panel.component';
import { TsFlowHttpInterceptorStepPanelComponent } from './ts-flow-http-interceptor-step-panel.component';
import { TsFlowHttpMiddlewareStepPanelComponent } from './ts-flow-http-middleware-step-panel.component';
import { TsFlowManualStepPanelComponent } from './ts-flow-manual-step-panel.component';
import { TsFlowRequestStepPanelComponent } from './ts-flow-request-step-panel.component';
import { TsFlowStepFailureAlertComponent } from './ts-flow-step-failure-alert.component';
import { TsFlowTriggerStepPanelComponent } from './ts-flow-trigger-step-panel.component';
import { TsFlowValidationStepPanelComponent } from './ts-flow-validation-step-panel.component';
import { TsFlowWaitStepPanelComponent } from './ts-flow-wait-step-panel.component';

@Component({
  selector: 'app-ts-flow-step-editor',
  standalone: true,
  imports: [
    FormsModule,
    TxFormFieldComponent,
    TxInputComponent,
    TxTextareaComponent,
    TxToggleComponent,
    TxButtonComponent,
    TxIconComponent,
    TxBannerComponent,
    TsFlowStepFailureAlertComponent,
    TsFlowRequestStepPanelComponent,
    TsFlowValidationStepPanelComponent,
    TsFlowE2eStepPanelComponent,
    TsFlowWaitStepPanelComponent,
    TsFlowManualStepPanelComponent,
    TsFlowDatabaseStepPanelComponent,
    TsFlowTriggerStepPanelComponent,
    TsFlowHttpMiddlewareStepPanelComponent,
    TsFlowHttpInterceptorStepPanelComponent,
  ],
  templateUrl: './ts-flow-step-editor.component.html',
  styleUrl: './ts-flow-step-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TsFlowStepEditorComponent {
  private readonly configService = inject(ConfigService);
  private readonly environmentsService = inject(EnvironmentsService);

  readonly step = input<TestSuiteFlowStep | null>(null);
  readonly flow = input<TestSuiteFlow | null>(null);
  readonly suiteItems = input<readonly import('@shared/testing').TestSuiteTreeItem[]>([]);
  readonly lastRunMessage = input<string | null>(null);
  readonly liveStepError = input<string | null>(null);
  readonly failureAlertDismissed = input(false);

  readonly stepChange = output<Partial<TestSuiteFlowStep>>();
  readonly removeStep = output<void>();
  readonly failureDismissed = output<void>();
  readonly failureReopened = output<void>();

  protected readonly stepTypeLabel = computed(() => {
    const step = this.step();
    return step ? FLOW_STEP_GUIDED_TITLES[step.stepType] : '';
  });

  protected readonly stepTypeIcon = computed((): TxIconName => {
    const step = this.step();
    return step ? FLOW_STEP_ADD_ICONS[step.stepType] : 'layers';
  });

  protected readonly stepTypeAccent = computed(() => {
    const step = this.step();
    return step ? flowStepTypeAccentToken(step.stepType) : 'var(--tx-accent)';
  });

  protected readonly stepNamePlaceholder = computed(() => {
    const step = this.step();
    if (!step || flowStepHasCustomName(step)) {
      return '';
    }
    return FLOW_STEP_GUIDED_TITLES[step.stepType];
  });

  protected readonly failureErrorMessage = computed(() => {
    const step = this.step();
    if (!step || step.lastRunStatus !== 'failed') {
      return null;
    }
    return resolveFlowStepRunError(step, 'failed', {
      liveError: this.liveStepError(),
      runMessage: this.lastRunMessage(),
    });
  });

  protected readonly showFailureAlert = computed(
    () =>
      this.step()?.lastRunStatus === 'failed' &&
      !this.failureAlertDismissed() &&
      Boolean(this.failureErrorMessage()),
  );

  protected readonly showFailureChip = computed(
    () =>
      this.step()?.lastRunStatus === 'failed' &&
      this.failureAlertDismissed() &&
      Boolean(this.failureErrorMessage()),
  );

  protected readonly failureStepName = computed(() => {
    const step = this.step();
    if (!step) {
      return 'Unnamed step';
    }
    const trimmed = step.name.trim();
    return trimmed.length > 0 ? trimmed : FLOW_STEP_GUIDED_TITLES[step.stepType];
  });

  protected readonly environmentKeyOptions = computed(() => ({
    useFolderPathInKeys:
      this.configService.settings()?.environments.useFolderPathInKeys ?? false,
  }));

  protected readonly variableCatalog = computed(() => {
    const flow = this.flow();
    const step = this.step();
    if (!flow || !step) {
      return [];
    }
    const environment = getEnvironmentDefinition(
      this.environmentsService.environments(),
      flow.environmentId,
    );
    return collectPriorFlowPlaceholderKeys(
      flow,
      step.id,
      environment,
      this.environmentKeyOptions(),
    );
  });

  protected readonly refStepOptions = computed(() => {
    const flow = this.flow();
    const step = this.step();
    if (!flow || !step) {
      return [];
    }
    return buildValidationRefStepOptions(flow, step.id);
  });

  protected readonly triggerTargetOptions = computed(() => {
    const step = this.step();
    if (!step || step.stepType !== 'TRIGGER') {
      return [];
    }
    const targetType = (step.config as { targetType?: string }).targetType ?? 'flow';
    return buildTriggerTargetOptions(
      this.suiteItems(),
      targetType === 'folder' ? 'folder' : 'flow',
    );
  });

  protected patch(patch: Partial<TestSuiteFlowStep>): void {
    this.stepChange.emit(patch);
  }

  protected patchConfig(config: Record<string, unknown>): void {
    this.stepChange.emit({ config });
  }

  protected rawConfigJson(): string {
    try {
      return JSON.stringify(this.step()?.config ?? {}, null, 2);
    } catch {
      return '{}';
    }
  }

  protected patchRawConfig(json: string): void {
    try {
      const config = JSON.parse(json) as Record<string, unknown>;
      this.stepChange.emit({ config });
    } catch {
      // ignore invalid JSON while typing
    }
  }
}
