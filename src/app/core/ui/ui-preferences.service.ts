import { Injectable, computed, effect, inject } from '@angular/core';

import { createDefaultSettings, type SettingsFile } from '@shared/config';

import { ConfigService } from '../config/config.service';

/**
 * Applies persisted `settings.ui` flags to the document and exposes them to the renderer.
 */
@Injectable({ providedIn: 'root' })
export class UiPreferencesService {
  private readonly config = inject(ConfigService);

  readonly ui = computed((): SettingsFile['ui'] => {
    return this.config.settings()?.ui ?? createDefaultSettings().ui;
  });

  readonly animationSpeed = computed(() => this.ui().animationSpeed);

  /** Derived from `animationSpeed !== 'none'` (replaces legacy `animationsEnabled`). */
  readonly animationsEnabled = computed(() => this.ui().animationSpeed !== 'none');

  readonly entranceStaggerEnabled = computed(() => this.animationsEnabled());

  readonly showIconTooltips = computed(() => this.ui().showIconTooltips);
  readonly useTranslucentChrome = computed(() => this.ui().useTranslucentChrome);
  readonly closeSidebarPanelOnOutsideClick = computed(
    () => this.ui().closeSidebarPanelOnOutsideClick,
  );
  readonly restoreLastSidebarPanel = computed(() => this.ui().restoreLastSidebarPanel);

  constructor() {
    effect(() => {
      this.applyToDocument(this.ui());
    });
  }

  private applyToDocument(ui: SettingsFile['ui']): void {
    if (typeof document === 'undefined') {
      return;
    }

    const root = document.documentElement;
    root.setAttribute('data-animation-speed', ui.animationSpeed);
    root.setAttribute('data-tooltips', ui.showIconTooltips ? 'enabled' : 'disabled');
    // Translucent chrome uses backdrop-filter — disabled in Electron (breaks hit-testing, esp. Win32).
    root.setAttribute('data-chrome-blur', 'disabled');
  }
}
