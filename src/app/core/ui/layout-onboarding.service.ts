import { Injectable, computed, inject } from '@angular/core';

import {
  buildOnboardingCompletePatch,
  type WorkspaceEditorLayoutId,
} from '@shared/config';
import type { AppearanceThemeId } from '@shared/theme';

import { ConfigService } from '@app/core/config/config.service';
import { ThemeService } from '@app/core/theme/theme.service';

/**
 * First-run onboarding state (theme + workspace layout).
 * Active until the user completes both steps and the choice is persisted.
 */
@Injectable({ providedIn: 'root' })
export class LayoutOnboardingService {
  private readonly config = inject(ConfigService);
  private readonly themeService = inject(ThemeService);

  readonly active = computed(() => {
    const settings = this.config.settings();
    if (!settings) {
      return false;
    }
    return !settings.general.layoutOnboardingCompleted;
  });

  isActive(): boolean {
    return this.active();
  }

  async applyOnboarding(theme: AppearanceThemeId, layout: WorkspaceEditorLayoutId): Promise<void> {
    await this.config.patchSettings(buildOnboardingCompletePatch({ theme, layout }));
    this.themeService.loadTheme(theme);
  }
}
