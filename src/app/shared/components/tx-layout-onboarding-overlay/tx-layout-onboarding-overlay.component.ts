import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';

import type { WorkspaceEditorLayoutId } from '@shared/config';
import { DEFAULT_APPEARANCE_THEME_ID, type AppearanceThemeId } from '@shared/theme';

import { ConfigService } from '@app/core/config/config.service';
import { ThemeService } from '@app/core/theme/theme.service';
import { TxSettingsThemeGroupComponent } from '../tx-settings-popup/sections/tx-settings-theme-group.component';
import { SETTINGS_THEME_PICKER_GROUPS } from '../tx-settings-popup/sections/tx-settings-theme-picker.data';

import { TxBrandLogoComponent } from '../tx-brand-logo/tx-brand-logo.component';
import { TxButtonComponent } from '../tx-button/tx-button.component';
import { TxIconComponent } from '../tx-icon/tx-icon.component';

export interface OnboardingCompletePayload {
  readonly theme: AppearanceThemeId;
  readonly layout: WorkspaceEditorLayoutId;
}

type OnboardingStep = 'theme' | 'layout';

@Component({
  selector: 'tx-layout-onboarding-overlay',
  standalone: true,
  imports: [
    TxBrandLogoComponent,
    TxButtonComponent,
    TxIconComponent,
    TxSettingsThemeGroupComponent,
  ],
  templateUrl: './tx-layout-onboarding-overlay.component.html',
  styleUrl: './tx-layout-onboarding-overlay.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-layout-onboarding-overlay-host',
    '[class.tx-layout-onboarding-overlay-host--visible]': 'visible()',
    '[class.tx-layout-onboarding-overlay-host--theme-step]': "step() === 'theme'",
  },
})
export class TxLayoutOnboardingOverlayComponent {
  private readonly config = inject(ConfigService);
  private readonly themeService = inject(ThemeService);

  readonly visible = input(false);

  readonly onboardingCompleted = output<OnboardingCompletePayload>();

  protected readonly step = signal<OnboardingStep>('theme');
  protected readonly themePickerGroups = SETTINGS_THEME_PICKER_GROUPS;
  protected readonly selectedTheme = signal<AppearanceThemeId>(DEFAULT_APPEARANCE_THEME_ID);
  protected readonly selectedLayout = signal<WorkspaceEditorLayoutId | null>(null);
  protected readonly submitting = signal(false);

  protected readonly activeTheme = computed(
    () => this.selectedTheme(),
  );

  constructor() {
    const settingsTheme = this.config.settings()?.appearance.theme;
    if (settingsTheme) {
      this.selectedTheme.set(settingsTheme);
    }
  }

  protected handleSelectTheme(themeId: AppearanceThemeId): void {
    if (this.submitting()) {
      return;
    }
    this.selectedTheme.set(themeId);
    this.themeService.loadTheme(themeId);
  }

  protected handleContinueThemeStep(): void {
    if (this.submitting()) {
      return;
    }
    this.step.set('layout');
  }

  protected handleSelectLayout(layout: WorkspaceEditorLayoutId): void {
    if (this.submitting()) {
      return;
    }
    this.selectedLayout.set(layout);
  }

  protected handleContinueLayoutStep(): void {
    const layout = this.selectedLayout();
    if (!layout || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.onboardingCompleted.emit({
      theme: this.selectedTheme(),
      layout,
    });
  }
}
