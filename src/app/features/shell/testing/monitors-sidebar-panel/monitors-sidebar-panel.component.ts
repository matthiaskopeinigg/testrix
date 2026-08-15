import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  buildCollectionEnvironmentDropdownOptions,
  environmentIdFromDropdownValue,
  toEnvironmentDropdownValue,
} from '@shared/config';
import type { MonitorTargetKind } from '@shared/testing';
import { describeCron } from '@app/features/shell/development/tools/logic/cron.logic';

import { CollectionsService } from '@app/core/collections/collections.service';
import { EnvironmentsService } from '@app/core/environments/environments.service';
import { LoadTestService } from '@app/core/testing/load-test.service';
import { MonitorsService } from '@app/core/testing/monitors.service';
import { TestSuiteService } from '@app/core/testing/test-suite.service';
import { TxButtonComponent } from '@app/shared/components/forms/tx-button/tx-button.component';
import { TxDropdownComponent } from '@app/shared/components/forms/tx-dropdown/tx-dropdown.component';
import type { TxDropdownOption } from '@app/shared/components/forms/tx-dropdown/tx-dropdown.types';
import { TxFormFieldComponent } from '@app/shared/components/forms/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/forms/tx-input/tx-input.component';
import { TxTagComponent } from '@app/shared/components/forms/tx-tag/tx-tag.component';
import { TxToggleComponent } from '@app/shared/components/forms/tx-toggle/tx-toggle.component';
import { isLoadTestArtifactNode } from '../load-test-sidebar-panel/load-test-tree.mutations';
import { TestingProgrammaticSidebarPanelBase } from '../testing-programmatic-sidebar-panel.base';
import type { CollectionTreeNode } from '@app/features/shell/collections/collection-tree.types';
import type { TestSuiteTreeNode } from '../test-suite-sidebar-panel/test-suite-tree.types';
import type { LoadTestTreeNode } from '../load-test-sidebar-panel/load-test-tree.types';

@Component({
  selector: 'app-monitors-sidebar-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxButtonComponent,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxInputComponent,
    TxTagComponent,
    TxToggleComponent,
  ],
  templateUrl: './monitors-sidebar-panel.component.html',
  styleUrl: './monitors-sidebar-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonitorsSidebarPanelComponent extends TestingProgrammaticSidebarPanelBase {
  private readonly monitorsService = inject(MonitorsService);
  private readonly collections = inject(CollectionsService);
  private readonly testSuite = inject(TestSuiteService);
  private readonly loadTest = inject(LoadTestService);
  private readonly environments = inject(EnvironmentsService);

  protected readonly panelTitle = 'Monitors';

  protected readonly name = signal('New monitor');
  protected readonly cron = signal(this.monitorsService.consumePendingCron() || '0 * * * *');
  protected readonly targetKind = signal<MonitorTargetKind>('request');
  protected readonly targetId = signal('');
  protected readonly environmentDropdown = signal(toEnvironmentDropdownValue(null));

  protected readonly monitors = this.monitorsService.monitors;
  protected readonly results = this.monitorsService.results;

  protected readonly cronDescription = computed(() => describeCron(this.cron()));

  protected readonly kindOptions: readonly TxDropdownOption[] = [
    { value: 'request', label: 'Collection request' },
    { value: 'flow', label: 'Test suite flow' },
    { value: 'load-test', label: 'Load test' },
  ];

  protected readonly environmentOptions = computed(() =>
    buildCollectionEnvironmentDropdownOptions(this.environments.environments(), {
      includeInherit: true,
      inheritLabel: 'Inherit from target',
    }).map((option) => ({ value: option.value, label: option.label })),
  );

  protected readonly targetOptions = computed((): readonly TxDropdownOption[] => {
    const kind = this.targetKind();
    if (kind === 'request') {
      return flattenOptions(this.collections.nodes(), (node) => node.data?.kind === 'request');
    }
    if (kind === 'flow') {
      return flattenOptions(this.testSuite.nodes(), (node) => node.data?.kind === 'flow');
    }
    return flattenOptions(this.loadTest.nodes(), (node) => isLoadTestArtifactNode(node as LoadTestTreeNode));
  });

  constructor() {
    super();
    void this.monitorsService.hydrate();
  }

  protected handleKindChange(value: string): void {
    this.targetKind.set(value as MonitorTargetKind);
    this.targetId.set('');
  }

  protected handleCreate(): void {
    this.monitorsService.createMonitor({
      name: this.name(),
      cron: this.cron(),
      targetKind: this.targetKind(),
      targetId: this.targetId(),
      environmentId: environmentIdFromDropdownValue(this.environmentDropdown()),
    });
  }

  protected handleToggle(id: string, enabled: boolean): void {
    this.monitorsService.patchMonitor(id, { enabled });
  }

  protected handleRunNow(id: string): void {
    void this.monitorsService.runNow(id);
  }

  protected handleDelete(id: string): void {
    this.monitorsService.deleteMonitor(id);
  }

  protected resultsFor(id: string) {
    return this.results().filter((row) => row.monitorId === id).slice(0, 5);
  }

  protected cronLabel(expression: string): string {
    return describeCron(expression);
  }
}

function flattenOptions(
  nodes: readonly CollectionTreeNode[] | readonly TestSuiteTreeNode[] | readonly LoadTestTreeNode[],
  include: (node: CollectionTreeNode | TestSuiteTreeNode | LoadTestTreeNode) => boolean,
  parentPath = '',
): TxDropdownOption[] {
  const out: TxDropdownOption[] = [];
  for (const node of nodes) {
    const path = parentPath ? `${parentPath} / ${node.label}` : node.label;
    if (include(node)) {
      out.push({ value: node.id, label: path });
    }
    if (node.children?.length) {
      out.push(
        ...flattenOptions(
          node.children as CollectionTreeNode[],
          include,
          path,
        ),
      );
    }
  }
  return out;
}
