import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { getEnvironmentDefinition } from '@shared/config';
import type { TestSuiteFlow, TestSuiteFlowStep, TestSuiteTreeItem } from '@shared/testing';
import { resolveFlowStepRunError } from '@shared/testing';

import { ConfigService } from '@app/core/config/config.service';
import { EnvironmentsService } from '@app/core/environments/environments.service';
import { openTestSuiteFlowStep } from '@app/core/testing/open-test-suite-flow-step';
import { TestSuiteService } from '@app/core/testing/test-suite.service';
import { TestingSessionService } from '@app/core/testing/testing-session.service';
import { openEnvironmentVariableTab } from '@app/core/workspace/open-environment-variable-tab';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';

import { TxBannerComponent } from '@app/shared/components/feedback/tx-banner/tx-banner.component';
import { TxButtonComponent } from '@app/shared/components/forms/tx-button/tx-button.component';
import { TxFormFieldComponent } from '@app/shared/components/forms/tx-form-field/tx-form-field.component';
import { TxIconComponent } from '@app/shared/components/forms/tx-icon/tx-icon.component';
import type { TxIconName } from '@app/shared/icons';
import { TxInputComponent } from '@app/shared/components/forms/tx-input/tx-input.component';
import { TxTextareaComponent } from '@app/shared/components/forms/tx-textarea/tx-textarea.component';
import { TxToggleComponent } from '@app/shared/components/forms/tx-toggle/tx-toggle.component';

import { collectPriorFlowPlaceholderKeys, findCatalogPlaceholderSource } from './flow-step-variable-catalog';
import { buildValidationRefStepOptions } from './flow-step-picker-options';
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
import { TsFlowCacheStepPanelComponent } from './ts-flow-cache-step-panel.component';
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
    TsFlowCacheStepPanelComponent,
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
  private readonly testSuite = inject(TestSuiteService);
  private readonly testingSession = inject(TestingSessionService);
  private readonly workspaceEditor = inject(WorkspaceEditorService);

  readonly step = input<TestSuiteFlowStep | null>(null);
  readonly flow = input<TestSuiteFlow | null>(null);
  readonly suiteItems = input<readonly TestSuiteTreeItem[]>([]);
  readonly lastRunMessage = input<string | null>(null);
  readonly liveStepError = input<string | null>(null);
  readonly failureAlertDismissed = input(false);

  readonly stepChange = output<Partial<TestSuiteFlowStep>>();
  readonly removeStep = output<void>();
  readonly failureDismissed = output<void>();
  readonly failureReopened = output<void>();
  /** Same-flow step to select when the user clicks a `{{placeholder}}` produced here. */
  readonly selectStep = output<string>();

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
    const effectiveId = this.testSuite.resolveFlowEnvironmentId(flow.id);
    const environment = getEnvironmentDefinition(
      this.environmentsService.environments(),
      effectiveId,
    );
    return collectPriorFlowPlaceholderKeys(
      flow,
      step.id,
      environment,
      this.environmentKeyOptions(),
      this.suiteItems(),
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

  protected patch(patch: Partial<TestSuiteFlowStep>): void {
    this.stepChange.emit(patch);
  }

  protected patchConfig(config: Record<string, unknown>): void {
    this.stepChange.emit({ config });
  }

  /**
   * Opens the CACHE / MANUAL step that produced `{{key}}`, or the environment variable editor.
   */
  protected handlePlaceholderClick(event: { readonly key: string }): void {
    const key = event.key.trim();
    if (!key) {
      return;
    }
    const source = findCatalogPlaceholderSource(this.variableCatalog(), key);
    const flow = this.flow();
    if (source) {
      if (flow && source.flowId === flow.id) {
        this.selectStep.emit(source.stepId);
        return;
      }
      void openTestSuiteFlowStep(
        this.workspaceEditor,
        this.configService,
        this.testingSession,
        source.flowId,
        source.stepId,
      );
      return;
    }
    const effectiveId = flow ? this.testSuite.resolveFlowEnvironmentId(flow.id) : null;
    openEnvironmentVariableTab(
      this.workspaceEditor,
      this.environmentsService.environments(),
      key,
      effectiveId,
      this.environmentKeyOptions(),
    );
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
