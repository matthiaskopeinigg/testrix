import { Injectable, inject } from '@angular/core';

import { ConfigService } from '@app/core/config/config.service';
import {
  createDefaultWorkspaceDesignSystem,
  type WorkspaceDesignSystemState,
} from '@shared/config';

import { DESIGN_SYSTEM_NAV } from './design-system.registry';
import type { DesignSystemPillar, DesignSystemViewState } from './design-system.types';

const LEGACY_SESSION_STORAGE_KEY = 'testrix.designSystemViewState';

/**
 * Persists Design System nav in {@link SessionFile.workspace.designSystem}.
 */
@Injectable({ providedIn: 'root' })
export class DesignSystemSessionService {
  private readonly config = inject(ConfigService);

  private legacyMigrated = false;

  /** One-time import from pre-sessionStorage persistence. */
  load(): void {
    if (this.legacyMigrated) {
      return;
    }
    this.legacyMigrated = true;

    const current = this.readWorkspaceSlice();
    if (this.hasPersistedNav(current)) {
      return;
    }

    const legacy = this.readLegacySessionStorage();
    if (!legacy || !isValidDesignSystemViewState(legacy)) {
      return;
    }

    void this.config.patchSession({
      workspace: {
        designSystem: {
          activePillar: legacy.activePillar,
          activeSectionId: legacy.activeSectionId,
          expandedPillars: legacy.expandedPillars.length > 0 ? [...legacy.expandedPillars] : [legacy.activePillar],
          debugEnabled: legacy.debugEnabled,
        },
      },
    });

    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
    }
  }

  get(): DesignSystemViewState | null {
    const slice = this.readWorkspaceSlice();
    if (!slice) {
      return null;
    }
    const view = workspaceSliceToViewState(slice);
    return isValidDesignSystemViewState(view) ? view : null;
  }

  getDefault(): DesignSystemViewState {
    const defaults = createDefaultWorkspaceDesignSystem();
    return workspaceSliceToViewState(defaults);
  }

  patch(partial: Partial<DesignSystemViewState>): void {
    const current = this.get() ?? this.getDefault();
    const next: DesignSystemViewState = {
      activePillar: partial.activePillar ?? current.activePillar,
      activeSectionId: partial.activeSectionId ?? current.activeSectionId,
      expandedPillars: partial.expandedPillars ?? current.expandedPillars,
      debugEnabled: partial.debugEnabled ?? current.debugEnabled,
    };
    if (!isValidDesignSystemViewState(next)) {
      return;
    }

    void this.config.patchSession({
      workspace: {
        designSystem: {
          activePillar: next.activePillar,
          activeSectionId: next.activeSectionId,
          expandedPillars: [...next.expandedPillars],
          debugEnabled: next.debugEnabled,
        },
      },
    });
  }

  private readWorkspaceSlice(): WorkspaceDesignSystemState | null {
    return this.config.session()?.workspace.designSystem ?? null;
  }

  private hasPersistedNav(slice: WorkspaceDesignSystemState | null): boolean {
    if (!slice) {
      return false;
    }
    const defaults = createDefaultWorkspaceDesignSystem();
    return (
      slice.activePillar !== defaults.activePillar ||
      slice.activeSectionId !== defaults.activeSectionId ||
      slice.debugEnabled !== defaults.debugEnabled ||
      !expandedPillarsEqual(slice.expandedPillars, defaults.expandedPillars)
    );
  }

  private readLegacySessionStorage(): DesignSystemViewState | null {
    if (typeof sessionStorage === 'undefined') {
      return null;
    }
    try {
      const raw = sessionStorage.getItem(LEGACY_SESSION_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as Partial<DesignSystemViewState>;
      return {
        activePillar: parsed.activePillar ?? 'style-guide',
        activeSectionId: parsed.activeSectionId ?? 'sg-typography',
        expandedPillars: Array.isArray(parsed.expandedPillars)
          ? parsed.expandedPillars
          : parsed.activePillar
            ? [parsed.activePillar]
            : [],
        debugEnabled: parsed.debugEnabled ?? false,
      };
    } catch {
      return null;
    }
  }
}

function workspaceSliceToViewState(slice: WorkspaceDesignSystemState): DesignSystemViewState {
  return {
    activePillar: slice.activePillar,
    activeSectionId: slice.activeSectionId,
    expandedPillars: slice.expandedPillars,
    debugEnabled: slice.debugEnabled,
  };
}

export function isValidDesignSystemViewState(
  state: DesignSystemViewState | null | undefined,
): state is DesignSystemViewState {
  if (!state?.activePillar || !state.activeSectionId) {
    return false;
  }
  const group = DESIGN_SYSTEM_NAV.find((g) => g.pillar === state.activePillar);
  if (!group) {
    return false;
  }
  if (!group.sections.some((s) => s.id === state.activeSectionId)) {
    return false;
  }
  if (!Array.isArray(state.expandedPillars)) {
    return false;
  }
  return state.expandedPillars.every((pillar) =>
    DESIGN_SYSTEM_NAV.some((g) => g.pillar === pillar),
  );
}

export function resolveDesignSystemViewState(): DesignSystemViewState {
  return workspaceSliceToViewState(createDefaultWorkspaceDesignSystem());
}

export function sectionIdForPillar(
  pillar: DesignSystemPillar,
  preferredSectionId?: string,
): string {
  const group = DESIGN_SYSTEM_NAV.find((g) => g.pillar === pillar);
  if (!group) {
    return resolveDesignSystemViewState().activeSectionId;
  }
  if (preferredSectionId && group.sections.some((s) => s.id === preferredSectionId)) {
    return preferredSectionId;
  }
  return group.sections[0]?.id ?? 'sg-typography';
}

function expandedPillarsEqual(
  a: readonly DesignSystemPillar[],
  b: readonly DesignSystemPillar[],
): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((pillar, index) => pillar === b[index]);
}
