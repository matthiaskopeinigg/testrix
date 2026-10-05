import {
  SETTINGS_NAV,
  SETTINGS_NAV_GROUPS,
  type SettingsCategory,
} from './settings-registry';

export type SettingsWizardMode = 'abbreviated' | 'full';

export type SettingsWizardStepId =
  | 'get-started'
  | 'theme'
  | 'save'
  | 'motion'
  | 'network-essentials'
  | 'done'
  | SettingsCategory;

export interface SettingsWizardPlacement {
  readonly groupIndex: number;
  readonly substep: number;
}

export interface SettingsWizardStep {
  readonly id: SettingsWizardStepId;
  readonly label: string;
  readonly groupIndex: number;
  readonly substep: number;
  readonly category: SettingsCategory | null;
  readonly highlightId: string | null;
}

export interface NetworkEssentialsPhase {
  readonly category: SettingsCategory;
  readonly highlightId: string;
}

export const NETWORK_ESSENTIALS_PHASES: readonly NetworkEssentialsPhase[] = [
  { category: 'proxy', highlightId: 'proxy-mode' },
  { category: 'certificates', highlightId: 'tls-verify' },
];

/**
 * Maps a settings category to its wizard group index and substep within that group.
 */
export function categoryPlacement(category: SettingsCategory): SettingsWizardPlacement {
  for (let groupIndex = 0; groupIndex < SETTINGS_NAV_GROUPS.length; groupIndex += 1) {
    const substep = SETTINGS_NAV_GROUPS[groupIndex]!.ids.indexOf(category);
    if (substep >= 0)
      return { groupIndex, substep };
  }
  return { groupIndex: 0, substep: 0 };
}

/**
 * Builds the full category walk derived from {@link SETTINGS_NAV_GROUPS}.
 */
export function buildFullWizardSteps(): readonly SettingsWizardStep[] {
  const steps: SettingsWizardStep[] = [];
  for (let groupIndex = 0; groupIndex < SETTINGS_NAV_GROUPS.length; groupIndex += 1) {
    const group = SETTINGS_NAV_GROUPS[groupIndex]!;
    group.ids.forEach((id, substep) => {
      const nav = SETTINGS_NAV.find((item) => item.id === id);
      steps.push({
        id,
        label: nav?.label ?? id,
        groupIndex,
        substep,
        category: id,
        highlightId: null,
      });
    });
  }
  return steps;
}

export const ABBREVIATED_WIZARD_STEPS: readonly SettingsWizardStep[] = [
  {
    id: 'get-started',
    label: 'Get started',
    groupIndex: 0,
    substep: 0,
    category: null,
    highlightId: null,
  },
  {
    id: 'theme',
    label: 'Theme',
    groupIndex: 0,
    substep: 0,
    category: 'appearance',
    highlightId: 'theme',
  },
  {
    id: 'save',
    label: 'Save',
    groupIndex: 0,
    substep: 0,
    category: 'appearance',
    highlightId: 'save-mode',
  },
  {
    id: 'motion',
    label: 'Motion',
    groupIndex: 0,
    substep: 0,
    category: 'appearance',
    highlightId: 'motion',
  },
  {
    id: 'network-essentials',
    label: 'Proxy & TLS',
    groupIndex: 2,
    substep: 0,
    category: 'proxy',
    highlightId: 'proxy-mode',
  },
  {
    id: 'done',
    label: 'Done',
    groupIndex: 3,
    substep: 0,
    category: null,
    highlightId: null,
  },
];

/**
 * Returns wizard steps for the given mode.
 */
export function wizardStepsForMode(mode: SettingsWizardMode): readonly SettingsWizardStep[] {
  return mode === 'abbreviated' ? ABBREVIATED_WIZARD_STEPS : buildFullWizardSteps();
}

/**
 * Index of the full-wizard step that shows {@link category}, or -1 when absent.
 */
export function fullStepIndexForCategory(category: SettingsCategory): number {
  return buildFullWizardSteps().findIndex((step) => step.category === category);
}

/**
 * Resolves a deep-link target to full-wizard placement.
 */
export function resolveSettingsDeepLink(category: SettingsCategory): {
  readonly stepIndex: number;
  readonly placement: SettingsWizardPlacement;
} {
  const placement = categoryPlacement(category);
  const stepIndex = fullStepIndexForCategory(category);
  return { stepIndex: stepIndex >= 0 ? stepIndex : 0, placement };
}
