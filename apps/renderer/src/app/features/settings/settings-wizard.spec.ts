import { describe, expect, it } from 'vitest';

import { SETTINGS_NAV_GROUPS } from './settings-registry';
import {
  ABBREVIATED_WIZARD_STEPS,
  buildFullWizardSteps,
  categoryPlacement,
  fullStepIndexForCategory,
  resolveSettingsDeepLink,
  wizardStepsForMode,
} from './settings-wizard';

describe('categoryPlacement', () => {
  it('maps categories to group index and substep from SETTINGS_NAV_GROUPS', () => {
    expect(categoryPlacement('appearance')).toEqual({ groupIndex: 0, substep: 0 });
    expect(categoryPlacement('keyboard')).toEqual({ groupIndex: 0, substep: 1 });
    expect(categoryPlacement('http')).toEqual({ groupIndex: 1, substep: 0 });
    expect(categoryPlacement('database')).toEqual({ groupIndex: 1, substep: 1 });
    expect(categoryPlacement('collab')).toEqual({ groupIndex: 1, substep: 2 });
    expect(categoryPlacement('proxy')).toEqual({ groupIndex: 2, substep: 0 });
    expect(categoryPlacement('dns')).toEqual({ groupIndex: 2, substep: 1 });
    expect(categoryPlacement('certificates')).toEqual({ groupIndex: 2, substep: 2 });
    expect(categoryPlacement('logging')).toEqual({ groupIndex: 3, substep: 0 });
    expect(categoryPlacement('data')).toEqual({ groupIndex: 3, substep: 1 });
    expect(categoryPlacement('updates')).toEqual({ groupIndex: 3, substep: 2 });
    expect(categoryPlacement('about')).toEqual({ groupIndex: 3, substep: 3 });
  });
});

describe('buildFullWizardSteps', () => {
  it('flattens SETTINGS_NAV_GROUPS in order', () => {
    const steps = buildFullWizardSteps();
    const expectedCount = SETTINGS_NAV_GROUPS.reduce((sum, group) => sum + group.ids.length, 0);
    expect(steps).toHaveLength(expectedCount);
    expect(steps[0]?.id).toBe('appearance');
    expect(steps[steps.length - 1]?.id).toBe('about');
  });
});

describe('wizardStepsForMode', () => {
  it('returns abbreviated essentials then done', () => {
    const steps = wizardStepsForMode('abbreviated');
    expect(steps).toEqual(ABBREVIATED_WIZARD_STEPS);
    expect(steps.map((step) => step.id)).toEqual([
      'get-started',
      'theme',
      'save',
      'motion',
      'network-essentials',
      'done',
    ]);
  });
});

describe('fullStepIndexForCategory', () => {
  it('finds proxy in the network group', () => {
    expect(fullStepIndexForCategory('proxy')).toBe(5);
    expect(resolveSettingsDeepLink('proxy').placement).toEqual({ groupIndex: 2, substep: 0 });
  });
});
