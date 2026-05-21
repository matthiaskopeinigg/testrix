import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

import {
  findComponentEntry,
  findDesignSystemSection,
  parseComponentSectionId,
} from '@app/core/design-system/design-system.registry';
import { DesignSystemSessionService } from '@app/core/design-system/design-system-session.service';
import type { DesignSystemPillar } from '@app/core/design-system/design-system.types';
import { DsBrandPanelComponent } from '@app/features/dev/pages/design-system/panels/ds-brand-panel.component';
import { DsComponentsPanelComponent } from '@app/features/dev/pages/design-system/panels/ds-components-panel.component';
import { DsPatternsPanelComponent } from '@app/features/dev/pages/design-system/panels/ds-patterns-panel.component';
import { DsStyleGuidePanelComponent } from '@app/features/dev/pages/design-system/panels/ds-style-guide-panel.component';
import { DsUiKitPanelComponent } from '@app/features/dev/pages/design-system/panels/ds-ui-kit-panel.component';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';

@Component({
  selector: 'app-design-system-workspace-tab',
  standalone: true,
  imports: [
    TxButtonComponent,
    TxIconComponent,
    DsStyleGuidePanelComponent,
    DsBrandPanelComponent,
    DsComponentsPanelComponent,
    DsPatternsPanelComponent,
    DsUiKitPanelComponent,
  ],
  templateUrl: './design-system-workspace-tab.component.html',
  styleUrl: './design-system-workspace-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DesignSystemWorkspaceTabComponent {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly designSystemSession = inject(DesignSystemSessionService);

  /** Design system section id (e.g. `sg-typography`, `comp-button`). */
  readonly resourceId = input.required<string>();
  readonly active = input(false);

  readonly debugEnabled = signal(false);

  protected readonly located = computed(() => findDesignSystemSection(this.resourceId()));

  protected readonly activePillar = computed((): DesignSystemPillar | null =>
    this.located()?.group.pillar ?? null,
  );

  protected readonly activeSectionLabel = computed(
    () => this.located()?.section.label ?? this.resourceId(),
  );

  protected readonly activeSectionDescription = computed(
    () => this.located()?.section.description ?? '',
  );

  protected readonly activePillarLabel = computed(() => this.located()?.group.label ?? '');

  constructor() {
    effect(() => {
      if (!this.active()) {
        return;
      }
      this.designSystemSession.load();
      const saved = this.designSystemSession.get();
      this.debugEnabled.set(saved?.debugEnabled ?? false);
      this.cdr.markForCheck();
    });
  }

  protected sectionSupportsDebug(): boolean {
    const compId = parseComponentSectionId(this.resourceId());
    if (!compId) {
      return this.activePillar() === 'patterns' || this.activePillar() === 'ui-kit';
    }
    return findComponentEntry(compId)?.supportsDebug ?? false;
  }

  protected toggleDebug(): void {
    this.debugEnabled.update((v) => !v);
    const located = this.located();
    if (!located) {
      return;
    }
    this.designSystemSession.patch({
      activePillar: located.group.pillar,
      activeSectionId: this.resourceId(),
      debugEnabled: this.debugEnabled(),
    });
    this.cdr.markForCheck();
  }
}
