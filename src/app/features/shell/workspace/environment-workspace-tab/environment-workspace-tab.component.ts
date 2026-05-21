import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

import { EnvironmentsService } from '@app/core/environments/environments.service';
import {
  findEnvironmentIdForScopeNode,
  getEnvironmentDefinition,
} from '@app/features/shell/environments/environment-profile.utils';
import { EnvironmentTreePanelComponent } from '@app/features/shell/environments/environment-tree-panel.component';
import { findEnvironmentNode } from '@app/features/shell/environments/environment-tree.mutations';
import { toTreeNodes } from '@app/features/shell/environments/environment-tree.adapter';
import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';

import { EnvironmentVariableEditorComponent } from './environment-variable-editor.component';

@Component({
  selector: 'app-environment-workspace-tab',
  standalone: true,
  imports: [
    TxBannerComponent,
    TxIconComponent,
    EnvironmentTreePanelComponent,
    EnvironmentVariableEditorComponent,
  ],
  templateUrl: './environment-workspace-tab.component.html',
  styleUrl: './environment-workspace-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnvironmentWorkspaceTabComponent {
  private readonly environmentsService = inject(EnvironmentsService);

  /** Environment id, or legacy scope node id. */
  readonly resourceId = input.required<string>();
  readonly active = input(false);

  protected readonly selectedVariableId = signal<string | null>(null);

  protected readonly environments = computed(() => this.environmentsService.environments());

  protected readonly environmentId = computed(() => {
    const id = this.resourceId();
    if (getEnvironmentDefinition(this.environments(), id)) {
      return id;
    }
    return findEnvironmentIdForScopeNode(this.environments(), id);
  });

  protected readonly missing = computed(() => !this.environmentId());

  protected readonly profileTitle = computed(() => {
    const envId = this.environmentId();
    if (!envId) {
      return 'Environment';
    }
    return getEnvironmentDefinition(this.environments(), envId)?.name ?? 'Environment';
  });

  private lastTabResourceId: string | null = null;

  constructor() {
    effect(() => {
      if (!this.active()) {
        return;
      }
      const tabResourceId = this.resourceId();
      if (tabResourceId === this.lastTabResourceId) {
        return;
      }
      this.lastTabResourceId = tabResourceId;

      const environments = this.environmentsService.environments();
      if (getEnvironmentDefinition(environments, tabResourceId)) {
        this.selectedVariableId.set(null);
        return;
      }

      const envId = findEnvironmentIdForScopeNode(environments, tabResourceId);
      if (!envId) {
        this.selectedVariableId.set(null);
        return;
      }

      const scope = toTreeNodes(getEnvironmentDefinition(environments, envId)!.nodes);
      const loc = findEnvironmentNode(scope, tabResourceId);
      if (loc?.node.data?.kind === 'variable') {
        this.selectedVariableId.set(tabResourceId);
      }
    });
  }

  protected handleSelectedVariableChange(id: string | null): void {
    this.selectedVariableId.set(id);
  }
}
