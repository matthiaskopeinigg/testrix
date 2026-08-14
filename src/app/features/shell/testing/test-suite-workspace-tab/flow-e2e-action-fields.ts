import type { z } from 'zod';

import type { e2eStepConfigSchema } from '@shared/testing';

/** E2E browser step action id from {@link e2eStepConfigSchema}. */
export type E2eStepAction = z.infer<typeof e2eStepConfigSchema>['action'];

/** Which editor fields are shown for a given E2E action. */
export interface E2eActionFieldLayout {
  readonly selector: boolean;
  readonly selectorPick: boolean;
  readonly pageUrl: boolean;
  readonly text: boolean;
  readonly expectedUrl: boolean;
  readonly screenshotFileName: boolean;
  readonly timeout: boolean;
}

const SELECTOR_ACTIONS: readonly E2eStepAction[] = [
  'CLICK',
  'TYPE_TEXT',
  'HOVER',
  'WAIT',
  'SCROLL_TO',
  'ASSERT_ELEMENT',
];

const SELECTOR_OPTIONAL_ACTIONS: readonly E2eStepAction[] = ['SCREENSHOT'];

/**
 * Returns the field layout for an E2E step action.
 */
export function layoutForE2eAction(action: E2eStepAction): E2eActionFieldLayout {
  return {
    selector: SELECTOR_ACTIONS.includes(action) || SELECTOR_OPTIONAL_ACTIONS.includes(action),
    selectorPick: SELECTOR_ACTIONS.includes(action) || SELECTOR_OPTIONAL_ACTIONS.includes(action),
    pageUrl: action === 'NAVIGATE_TO',
    text: action === 'TYPE_TEXT',
    expectedUrl: action === 'ASSERT_URL' || action === 'WAIT_FOR_URL',
    screenshotFileName: action === 'SCREENSHOT',
    timeout: true,
  };
}

/**
 * Human-readable selector field label (optional vs required).
 */
export function e2eSelectorFieldLabel(action: E2eStepAction): string {
  return action === 'SCREENSHOT' ? 'Element (optional)' : 'CSS selector';
}
