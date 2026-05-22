import { describe, expect, it } from 'vitest';

import { e2eSelectorFieldLabel, layoutForE2eAction } from './flow-e2e-action-fields';

describe('layoutForE2eAction', () => {
  it('shows page URL and timeout for navigate', () => {
    expect(layoutForE2eAction('NAVIGATE_TO')).toEqual({
      selector: false,
      selectorPick: false,
      pageUrl: true,
      text: false,
      expectedUrl: false,
      screenshotFileName: false,
      timeout: true,
    });
  });

  it('shows selector, pick, and timeout for click', () => {
    expect(layoutForE2eAction('CLICK')).toEqual({
      selector: true,
      selectorPick: true,
      pageUrl: false,
      text: false,
      expectedUrl: false,
      screenshotFileName: false,
      timeout: true,
    });
  });

  it('shows selector, pick, text, and timeout for type text', () => {
    expect(layoutForE2eAction('TYPE_TEXT')).toEqual({
      selector: true,
      selectorPick: true,
      pageUrl: false,
      text: true,
      expectedUrl: false,
      screenshotFileName: false,
      timeout: true,
    });
  });

  it('shows expected URL for assert and wait-for-url actions', () => {
    expect(layoutForE2eAction('ASSERT_URL').expectedUrl).toBe(true);
    expect(layoutForE2eAction('WAIT_FOR_URL').expectedUrl).toBe(true);
  });

  it('labels screenshot selector as optional', () => {
    expect(e2eSelectorFieldLabel('SCREENSHOT')).toBe('Element (optional)');
    expect(e2eSelectorFieldLabel('CLICK')).toBe('CSS selector');
  });
});
