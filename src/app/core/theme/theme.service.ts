import { Injectable, Injector, computed, inject, signal } from '@angular/core';

import { createDefaultSettings } from '@shared/config';
import {
  DEFAULT_APPEARANCE_THEME_ID,
  type AppearanceThemeId,
  isLightTheme,
  normalizeAppearanceThemeId,
} from '@shared/theme';

import { ConfigService } from '../config/config.service';
import { ElectronService } from '../electron/electron.service';

export interface ThemeApplyOptions {
  /** Crossfade when changing palette (default true). Initial load should pass false. */
  readonly animate?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly injector = inject(Injector);
  private readonly electron = inject(ElectronService);

  private readonly themeState = signal<AppearanceThemeId>(DEFAULT_APPEARANCE_THEME_ID);

  readonly theme = computed(() => this.themeState());

  /** Applies persisted settings theme without writing settings again. */
  loadTheme(theme: AppearanceThemeId | string): void {
    const resolved = normalizeAppearanceThemeId(theme);
    this.themeState.set(resolved);
    this.applyTheme(resolved, { animate: false });
  }

  async setTheme(theme: AppearanceThemeId, persist = true, options?: ThemeApplyOptions): Promise<void> {
    const resolved = normalizeAppearanceThemeId(theme);
    this.themeState.set(resolved);
    this.applyTheme(resolved, options);

    if (!persist) {
      return;
    }

    const api = this.electron.bridge();
    if (api) {
      const next = await api.config.setSettings({ appearance: { theme: resolved } });
      this.configService().syncSettings(next);
      return;
    }

    const current = this.configService().settings() ?? createDefaultSettings();
    this.configService().syncSettings({
      ...current,
      appearance: { ...current.appearance, theme: resolved },
    });
  }

  applyTheme(theme: AppearanceThemeId, options?: ThemeApplyOptions): void {
    const resolved = normalizeAppearanceThemeId(theme);
    const animate = options?.animate !== false;
    const apply = () => this.applyThemeToDom(resolved);

    if (animate && this.canAnimateThemeSwitch()) {
      this.setThemeSwitching(true);
      const transition = document.startViewTransition(() => apply());
      void this.whenThemeSwitchSettled(transition?.finished).finally(() => this.setThemeSwitching(false));
      return;
    }

    this.setThemeSwitching(true);
    apply();
    this.setThemeSwitching(false);
  }

  private configService(): ConfigService {
    return this.injector.get(ConfigService);
  }

  private applyThemeToDom(theme: AppearanceThemeId): void {
    this.stripThemeClasses(document.body);
    this.stripThemeClasses(document.documentElement);

    const themeClass = `theme-${theme}`;
    document.body.classList.add(themeClass);
    document.documentElement.classList.add(themeClass);
    const mode: 'light' | 'dark' = isLightTheme(theme) ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', mode);
  }

  private stripThemeClasses(el: HTMLElement): void {
    for (const cls of Array.from(el.classList)) {
      if (cls.startsWith('theme-')) {
        el.classList.remove(cls);
      }
    }
  }

  private setThemeSwitching(active: boolean): void {
    if (typeof document === 'undefined') {
      return;
    }
    if (active) {
      document.documentElement.dataset['themeSwitching'] = 'true';
    } else {
      delete document.documentElement.dataset['themeSwitching'];
    }
  }

  private async whenThemeSwitchSettled(finished?: Promise<void>): Promise<void> {
    const fallbackMs = 420;
    if (finished) {
      await Promise.race([finished, new Promise<void>((resolve) => setTimeout(resolve, fallbackMs))]);
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, fallbackMs));
  }

  private canAnimateThemeSwitch(): boolean {
    if (typeof document === 'undefined' || typeof document.startViewTransition !== 'function') {
      return false;
    }
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return false;
    }
    return document.documentElement.getAttribute('data-animation-speed') !== 'none';
  }
}
