import { describe, expect, it } from 'vitest';

import { PICK_ELEMENT_AT_POINT_FN } from './e2e-picker-targets';

interface PickBox {
  id: string;
  style: Record<string, string>;
  setAttribute: () => void;
}

function loadPick(document: object, window: object): (x: number, y: number, kind: string) => string {
  return new Function(
    'document',
    'window',
    `return (${PICK_ELEMENT_AT_POINT_FN});`,
  )(document, window) as (x: number, y: number, kind: string) => string;
}

describe('PICK_ELEMENT_AT_POINT_FN', () => {
  it('selects the button under the cursor, not the block above it', () => {
    const painted: { box: PickBox | null } = { box: null };
    const button = {
      nodeType: 1,
      tagName: 'BUTTON',
      id: 'register',
      parentElement: null as unknown,
      shadowRoot: null,
      classList: { length: 0, forEach() {} },
      getAttribute: () => null,
      hasAttribute: () => false,
      getBoundingClientRect: () => ({ left: 120, top: 340, width: 140, height: 36 }),
      getRootNode() {
        return doc;
      },
      ownerDocument: null as unknown,
    };
    const warning = {
      nodeType: 1,
      tagName: 'DIV',
      id: 'otp-hint',
      parentElement: null as unknown,
      shadowRoot: null,
      classList: { length: 0, forEach() {} },
      getAttribute: () => null,
      hasAttribute: () => false,
      getBoundingClientRect: () => ({ left: 40, top: 220, width: 420, height: 70 }),
      getRootNode() {
        return doc;
      },
      ownerDocument: null as unknown,
    };
    const doc = {
      nodeType: 9,
      documentElement: {
        nodeType: 1,
        appendChild(el: PickBox) {
          painted.box = el;
        },
      },
      getElementById(id: string) {
        return id === '__tx-pick-box' ? painted.box : null;
      },
      createElement(): PickBox {
        return { id: '', style: {}, setAttribute() {} };
      },
      elementFromPoint(x: number, y: number) {
        if (x === 160 && y === 350)
          return button;
        if (x === 80 && y === 250)
          return warning;
        return null;
      },
      querySelectorAll(selector: string) {
        if (selector === '#register')
          return [button];
        if (selector === '#otp-hint')
          return [warning];
        return [];
      },
    };
    button.ownerDocument = doc;
    warning.ownerDocument = doc;
    const pick = loadPick(doc, {});

    expect(pick(160, 350, 'browser-click')).toBe('#register');
    expect(painted.box?.style['top']).toBe('337px');
    expect(painted.box?.style['left']).toBe('117px');
    expect(pick(80, 250, 'browser-click')).toBe('#otp-hint');
  });

  it('snaps a label inside the button to the button', () => {
    const button = {
      nodeType: 1,
      tagName: 'BUTTON',
      id: 'register',
      parentElement: null as unknown,
      shadowRoot: null,
      classList: { length: 0, forEach() {} },
      getAttribute: () => null,
      hasAttribute: () => false,
      getBoundingClientRect: () => ({ left: 120, top: 340, width: 140, height: 36 }),
      getRootNode() {
        return doc;
      },
      ownerDocument: null as unknown,
    };
    const label = {
      nodeType: 1,
      tagName: 'SPAN',
      id: '',
      parentElement: button,
      shadowRoot: null,
      classList: { length: 0, forEach() {} },
      getAttribute: () => null,
      hasAttribute: () => false,
      getBoundingClientRect: () => ({ left: 150, top: 348, width: 80, height: 16 }),
      getRootNode() {
        return doc;
      },
      ownerDocument: null as unknown,
    };
    const doc = {
      nodeType: 9,
      documentElement: { nodeType: 1, appendChild() {} },
      getElementById: () => null,
      createElement(): PickBox {
        return { id: '', style: {}, setAttribute() {} };
      },
      elementFromPoint: () => label,
      querySelectorAll(selector: string) {
        return selector === '#register' ? [button] : [];
      },
    };
    button.ownerDocument = doc;
    label.ownerDocument = doc;
    const pick = loadPick(doc, {});
    expect(pick(170, 352, 'browser-click')).toBe('#register');
  });
});
