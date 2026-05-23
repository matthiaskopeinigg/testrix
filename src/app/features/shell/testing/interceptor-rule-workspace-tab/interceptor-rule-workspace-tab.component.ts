import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { CollectionRequestBody } from '@shared/config';
import type { InterceptorRule } from '@shared/testing';

import { ConfigService } from '@app/core/config/config.service';
import { InterceptorWorkspaceStore } from '@app/core/testing/interceptor-workspace.store';
import { WorkspaceTabMotionController } from '@app/core/ui/workspace-tab-motion';
import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';
import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxToggleComponent } from '@app/shared/components/tx-toggle/tx-toggle.component';

import { IntTabActionPanelComponent } from './int-tab-action-panel.component';

@Component({
  selector: 'app-interceptor-rule-workspace-tab',
  standalone: true,
  imports: [
    FormsModule,
    TxBannerComponent,
    TxFormFieldComponent,
    TxInputComponent,
    TxToggleComponent,
    IntTabActionPanelComponent,
  ],
  templateUrl: './interceptor-rule-workspace-tab.component.html',
  styleUrl: './interceptor-rule-workspace-tab.component.scss',
  host: { class: 'testing-workspace-tab-host' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InterceptorRuleWorkspaceTabComponent {
  private readonly interceptor = inject(InterceptorWorkspaceStore);
  private readonly configService = inject(ConfigService);
  private readonly uiPreferences = inject(UiPreferencesService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly tabMotion = new WorkspaceTabMotionController(
    this.uiPreferences,
    this.destroyRef,
  );

  readonly resourceId = input.required<string>();
  readonly active = input(false);

  protected readonly ruleId = computed(() =>
    this.resourceId().startsWith('int-rule:') ? this.resourceId().slice('int-rule:'.length) : '',
  );

  protected readonly rule = computed(() => {
    const id = this.ruleId();
    return id ? this.interceptor.findRule(id) : null;
  });

  protected readonly missing = computed(() => !!this.ruleId() && !this.rule());

  protected readonly title = computed(() => this.interceptor.labelForResource(this.resourceId()));

  constructor() {
    this.tabMotion.settleLoadImmediately();
    this.tabMotion.bindLoadReplay(
      () => `${this.configService.sessionRevision()}:${this.resourceId()}`,
      () => 1,
      { tabActive: () => this.active() },
    );
  }

  protected handleNameChange(name: string): void {
    const id = this.ruleId();
    if (!id) {
      return;
    }
    this.interceptor.patchRule(id, { name: name.trim() || 'New rule' });
  }

  protected handleMatchUrlChange(matchUrl: string): void {
    const id = this.ruleId();
    if (!id) {
      return;
    }
    this.interceptor.patchRule(id, { matchUrl: matchUrl.trim() || '*' });
  }

  protected handleEnabledChange(enabled: boolean): void {
    const id = this.ruleId();
    if (!id) {
      return;
    }
    this.interceptor.patchRule(id, { enabled });
  }

  protected handleActionChange(action: string): void {
    const id = this.ruleId();
    if (!id) {
      return;
    }
    if (action === 'proxy' || action === 'mock' || action === 'block') {
      this.interceptor.patchRule(id, { action });
    }
  }

  protected handleMockStatusChange(mockStatus: number | undefined): void {
    const id = this.ruleId();
    if (!id) {
      return;
    }
    this.interceptor.patchRule(id, { mockStatus });
  }

  protected handleMockBodyChange(mockBody: CollectionRequestBody): void {
    const id = this.ruleId();
    if (!id) {
      return;
    }
    this.interceptor.patchRule(id, { mockBody });
  }
}
