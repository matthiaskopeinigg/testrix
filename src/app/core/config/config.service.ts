import { Injectable, computed, inject, signal } from '@angular/core';

import type { CollectionsFile, SessionFile, SessionPatch, SettingsFile, SettingsPatch } from '@shared/config';
import {
  createDefaultSession,
  createDefaultSettings,
  enrichHttpHeadersSettings,
  httpHeaderRowsEqual,
  mergeWorkspaceDevelopment,
  mergeWorkspaceTesting,
} from '@shared/config';
import type { AppearanceThemeId } from '@shared/theme';

import { ElectronService } from '../electron/electron.service';
import { ErrorNotificationService } from '../errors/error-notification.service';
import { ThemeService } from '../theme/theme.service';
import { UiFontService } from '../theme/ui-font.service';

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly electron = inject(ElectronService);
  private readonly notifier = inject(ErrorNotificationService);
  private readonly themeService = inject(ThemeService);
  private readonly uiFontService = inject(UiFontService);

  private readonly settingsState = signal<SettingsFile | null>(null);
  private readonly sessionState = signal<SessionFile | null>(null);
  /** Bumped whenever session is reloaded (e.g. workspace profile switch). */
  private readonly sessionRevisionState = signal(0);

  readonly settings = computed(() => this.settingsState());
  readonly session = computed(() => this.sessionState());
  readonly sessionRevision = computed(() => this.sessionRevisionState());

  async hydrate(): Promise<void> {
    const api = this.electron.bridge();

    if (!api) {
      this.bootstrapBrowserMocks();
      return;
    }

    try {
      let [settings, session] = await Promise.all([api.config.getSettings(), api.config.getSession()]);
      await this.applyHydratedSettingsAndSession(settings, session, api.versions.app);
    } catch (error: unknown) {
      this.notifier.reportUnknown(error);
      this.bootstrapBrowserMocks();
      const appearance = this.settingsState()?.appearance;
      if (appearance) {
        this.applyAppearance(appearance);
      }
    }
  }

  /** Reloads session from disk after a workspace profile switch (settings unchanged). */
  async hydrateSession(): Promise<void> {
    const api = this.electron.bridge();
    if (!api) {
      return;
    }
    try {
      const session = await api.config.getSession();
      this.sessionState.set(session);
      this.sessionRevisionState.update((n) => n + 1);
    } catch (error: unknown) {
      this.notifier.reportUnknown(error);
    }
  }

  private async applyHydratedSettingsAndSession(
    settings: SettingsFile,
    session: SessionFile,
    appVersion: string,
  ): Promise<void> {
    const api = this.electron.bridge();
    if (!api) {
      return;
    }

    try {
      let nextSettings = settings;
      const headers = enrichHttpHeadersSettings(nextSettings.http.headers, appVersion);
      if (!httpHeaderRowsEqual(nextSettings.http.headers.rows, headers.rows)) {
        nextSettings = await api.config.setSettings({ http: { headers } });
      }
      this.settingsState.set(nextSettings);
      this.sessionState.set(session);
      this.sessionRevisionState.update((n) => n + 1);
      this.applyAppearance(nextSettings.appearance);
    } catch (error: unknown) {
      this.notifier.reportUnknown(error);
    }
  }

  /** Updates in-memory settings after IPC or browser mock writes. */
  syncSettings(settings: SettingsFile): void {
    this.settingsState.set(settings);
  }

  async patchSettings(patch: SettingsPatch): Promise<void> {
    const api = this.electron.bridge();

    if (!api) {
      const current = this.settingsState() ?? createDefaultSettings();
      const next: SettingsFile = {
        ...current,
        appearance: { ...current.appearance, ...patch.appearance },
        general: { ...current.general, ...patch.general },
        privacy: { ...current.privacy, ...patch.privacy },
        updates: { ...current.updates, ...patch.updates },
        ui: { ...current.ui, ...patch.ui },
        logging: { ...current.logging, ...patch.logging },
        dataConfig: { ...current.dataConfig, ...patch.dataConfig },
        collections: { ...current.collections, ...patch.collections },
        environments: { ...current.environments, ...patch.environments },
        editor: patch['editor']
          ? {
              ...current.editor,
              ...patch['editor'],
              keyboard: patch['editor'].keyboard
                ? { ...current.editor.keyboard, ...patch['editor'].keyboard }
                : current.editor.keyboard,
            }
          : current.editor,
        http: patch.http
          ? ({ ...current.http, ...patch.http } as SettingsFile['http'])
          : current.http,
      };
      this.settingsState.set(next);
      if (patch.appearance) {
        this.applyAppearance({ ...current.appearance, ...patch.appearance });
      }
      return;
    }

    const next = await api.config.setSettings(patch);
    this.settingsState.set(next);
    if (patch.appearance) {
      this.applyAppearance(next.appearance);
    }
  }

  async patchSession(patch: SessionPatch): Promise<void> {
    const api = this.electron.bridge();

    if (!api) {
      const current = this.sessionState() ?? createDefaultSession();
      const next: SessionFile = {
        ...current,
        meta: { ...current.meta, ...patch.meta },
        window: { ...current.window, ...patch.window },
        navigation: { ...current.navigation, ...patch.navigation },
        workspace: {
          ...current.workspace,
          ...patch.workspace,
          collections: {
            ...current.workspace.collections,
            ...patch.workspace?.collections,
            folderTabsById: patch.workspace?.collections?.folderTabsById
              ? {
                  ...current.workspace.collections.folderTabsById,
                  ...patch.workspace.collections.folderTabsById,
                }
              : current.workspace.collections.folderTabsById,
            requestTabsById: patch.workspace?.collections?.requestTabsById
              ? {
                  ...current.workspace.collections.requestTabsById,
                  ...patch.workspace.collections.requestTabsById,
                }
              : current.workspace.collections.requestTabsById,
            websocketTabsById: patch.workspace?.collections?.websocketTabsById
              ? {
                  ...current.workspace.collections.websocketTabsById,
                  ...patch.workspace.collections.websocketTabsById,
                }
              : current.workspace.collections.websocketTabsById,
            requestRunsById: patch.workspace?.collections?.requestRunsById
              ? {
                  ...current.workspace.collections.requestRunsById,
                  ...patch.workspace.collections.requestRunsById,
                }
              : current.workspace.collections.requestRunsById,
            folderRunsById: patch.workspace?.collections?.folderRunsById
              ? {
                  ...current.workspace.collections.folderRunsById,
                  ...patch.workspace.collections.folderRunsById,
                }
              : current.workspace.collections.folderRunsById,
          },
          environments: patch.workspace?.environments
            ? {
                ...current.workspace.environments,
                ...patch.workspace.environments,
              }
            : current.workspace.environments,
          editor: patch.workspace?.editor
            ? {
                ...current.workspace.editor,
                ...patch.workspace.editor,
                groups: patch.workspace.editor.groups
                  ? { ...current.workspace.editor.groups, ...patch.workspace.editor.groups }
                  : current.workspace.editor.groups,
              }
            : current.workspace.editor,
          designSystem: patch.workspace?.designSystem
            ? {
                ...current.workspace.designSystem,
                ...patch.workspace.designSystem,
                expandedPillars: patch.workspace.designSystem.expandedPillars
                  ? [...patch.workspace.designSystem.expandedPillars]
                  : current.workspace.designSystem.expandedPillars,
              }
            : current.workspace.designSystem,
          development: patch.workspace?.development
            ? mergeWorkspaceDevelopment(
                current.workspace.development,
                patch.workspace.development,
              )
            : current.workspace.development,
          testing: patch.workspace?.testing
            ? mergeWorkspaceTesting(current.workspace.testing, patch.workspace.testing)
            : current.workspace.testing,
        },
      };
      this.sessionState.set(next);
      return;
    }

    const next = await api.config.setSession(patch);
    this.sessionState.set(next);
  }

  /** Updates in-memory session after IPC or browser mock writes. */
  syncSession(session: SessionFile): void {
    this.sessionState.set(session);
  }

  private bootstrapBrowserMocks(): void {
    const settings = createDefaultSettings();
    this.settingsState.set(settings);
    this.sessionState.set(createDefaultSession());
    this.sessionRevisionState.update((n) => n + 1);
    this.applyAppearance(settings.appearance);
  }

  private applyAppearance(appearance: SettingsFile['appearance']): void {
    this.themeService.loadTheme(appearance.theme);
    this.uiFontService.loadAppearanceTypography(appearance);
  }

  /** @deprecated Prefer ThemeService.setTheme — kept for callers that only toggle DOM. */
  applyTheme(theme: AppearanceThemeId): void {
    this.themeService.applyTheme(theme);
  }

  async refresh(): Promise<void> {
    await this.hydrate();
  }
}
