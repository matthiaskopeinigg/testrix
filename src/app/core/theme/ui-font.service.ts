import { Injectable, Injector, inject } from '@angular/core';

import type { SettingsFile } from '@shared/config';
import type { UiFontId } from '@shared/theme';
import {
  buildUiFontStylesheetUrl,
  getUiFontDefinition,
  uiFontFamilyStack,
} from '@shared/theme';
import {
  type UiFontSizeId,
  type UiFontWeightId,
  type UiLineHeightId,
  resolveUiTypographyTokens,
} from '@shared/theme';

import { ConfigService } from '../config/config.service';

const STYLESHEET_LINK_ID = 'tx-ui-font-stylesheet';

export type AppearanceTypography = Pick<
  SettingsFile['appearance'],
  'uiFont' | 'uiFontSize' | 'uiFontWeight' | 'uiLineHeight'
>;

/**
 * Loads Google Fonts and applies interface typography from appearance settings.
 */
@Injectable({ providedIn: 'root' })
export class UiFontService {
  private readonly injector = inject(Injector);

  /** Applies persisted appearance typography without writing settings again. */
  loadAppearanceTypography(appearance: AppearanceTypography): void {
    this.applyToDom(appearance);
  }

  async patchAppearanceTypography(
    patch: Partial<AppearanceTypography>,
    persist = true,
  ): Promise<void> {
    const current = this.configService().settings();
    if (!current) {
      return;
    }

    const nextAppearance: AppearanceTypography = {
      uiFont: patch.uiFont ?? current.appearance.uiFont,
      uiFontSize: patch.uiFontSize ?? current.appearance.uiFontSize,
      uiFontWeight: patch.uiFontWeight ?? current.appearance.uiFontWeight,
      uiLineHeight: patch.uiLineHeight ?? current.appearance.uiLineHeight,
    };

    this.applyToDom(nextAppearance);

    if (!persist) {
      return;
    }

    await this.configService().patchSettings({ appearance: patch });
  }

  /** @deprecated Use {@link patchAppearanceTypography} with `{ uiFont }`. */
  loadUiFont(fontId: UiFontId): void {
    const current = this.configService().settings();
    if (!current) {
      this.applyToDom({
        uiFont: fontId,
        uiFontSize: 'medium',
        uiFontWeight: 'regular',
        uiLineHeight: 'normal',
      });
      return;
    }
    this.applyToDom({ ...current.appearance, uiFont: fontId });
  }

  /** @deprecated Use {@link patchAppearanceTypography} with `{ uiFont }`. */
  async setUiFont(fontId: UiFontId, persist = true): Promise<void> {
    await this.patchAppearanceTypography({ uiFont: fontId }, persist);
  }

  private configService(): ConfigService {
    return this.injector.get(ConfigService);
  }

  private applyToDom(appearance: AppearanceTypography): void {
    if (typeof document === 'undefined') {
      return;
    }

    const def = getUiFontDefinition(appearance.uiFont);
    const stack = uiFontFamilyStack(appearance.uiFont);
    const scale = resolveUiTypographyTokens(
      appearance.uiFontSize,
      appearance.uiFontWeight,
      appearance.uiLineHeight,
    );
    const root = document.documentElement;

    root.style.setProperty('--tx-font-body', stack);
    root.style.setProperty('--tx-font-heading', stack);
    root.style.fontSize = scale.rootFontSize;
    root.style.setProperty('--tx-ui-font-size-root', scale.rootFontSize);
    root.style.setProperty('--tx-ui-font-weight-body', scale.bodyWeight);
    root.style.setProperty('--tx-ui-font-weight-heading', scale.headingWeight);
    root.style.setProperty('--tx-ui-line-height', scale.lineHeight);
    root.setAttribute('data-ui-font', def.id);
    root.setAttribute('data-ui-font-size', appearance.uiFontSize);
    root.setAttribute('data-ui-font-weight', appearance.uiFontWeight);
    root.setAttribute('data-ui-line-height', appearance.uiLineHeight);

    this.ensureStylesheet(buildUiFontStylesheetUrl(appearance.uiFont));
  }

  private ensureStylesheet(href: string): void {
    if (typeof document === 'undefined') {
      return;
    }

    let link = document.getElementById(STYLESHEET_LINK_ID) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = STYLESHEET_LINK_ID;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }

    if (link.getAttribute('href') !== href) {
      link.setAttribute('href', href);
    }
  }
}
