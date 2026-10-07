import { describe, expect, it } from 'vitest';

import { FLOW_TEXT_TARGET_FNS } from './flow-text-target';

interface FlowTextFns {
  find: (root: unknown) => unknown;
  write: (host: unknown, text: string, clear: boolean) => boolean;
  read: (host: unknown) => string | null;
  focus: (host: unknown) => boolean;
}

function loadFns(inputCtor?: unknown): FlowTextFns {
  return new Function(
    'HTMLInputElement',
    'HTMLTextAreaElement',
    `${FLOW_TEXT_TARGET_FNS}
    return { find: __txFindEditable, write: __txWriteFlowText, read: __txReadFlowText, focus: __txFocusFlowText };
  `,
  )(inputCtor, undefined) as FlowTextFns;
}

describe('flow text target', () => {
  it('writes a pin into the input inside a custom element shadow root', () => {
    let usedNative = false;
    function HTMLInputElement() {}
    Object.defineProperty(HTMLInputElement.prototype, 'value', {
      configurable: true,
      get() {
        return (this as { nativeValue?: string }).nativeValue ?? '';
      },
      set(value: string) {
        usedNative = true;
        (this as { nativeValue?: string }).nativeValue = value;
      },
    });
    const input = Object.assign(Object.create(HTMLInputElement.prototype), {
      nodeType: 1,
      tagName: 'INPUT',
      focused: false,
      events: [] as string[],
      getAttribute: () => 'text',
      focus() {
        this.focused = true;
      },
      dispatchEvent(event: { type?: string }) {
        this.events.push(event.type ?? '');
      },
      querySelectorAll: () => [],
    });
    const shadow = {
      nodeType: 11,
      querySelectorAll(selector: string) {
        return selector.includes('input') ? [input] : [];
      },
    };
    const host = {
      nodeType: 1,
      tagName: 'ANG-OTP',
      shadowRoot: shadow,
      textContent: '',
      querySelectorAll: () => [],
    };
    const fns = loadFns(HTMLInputElement);
    expect(fns.write(host, '646462', true)).toBe(true);
    expect(usedNative).toBe(true);
    expect(fns.read(host)).toBe('646462');
    expect(input.focused).toBe(true);
    expect(input.events).toContain('input');
  });

  it('appends when clear is false and skips hidden inputs', () => {
    const hidden = {
      nodeType: 1,
      tagName: 'INPUT',
      value: 'secret',
      getAttribute: () => 'hidden',
      querySelectorAll: () => [],
    };
    const visible = {
      nodeType: 1,
      tagName: 'INPUT',
      value: '12',
      events: [] as string[],
      getAttribute: () => 'text',
      focus() {},
      dispatchEvent(event: { type?: string }) {
        this.events.push(event.type ?? '');
      },
      querySelectorAll: () => [],
    };
    const host = {
      nodeType: 1,
      tagName: 'DIV',
      querySelectorAll(selector: string) {
        return selector.includes('input') ? [hidden, visible] : [hidden, visible];
      },
    };
    const fns = loadFns();
    expect(fns.find(host)).toBe(visible);
    expect(fns.write(host, '34', false)).toBe(true);
    expect(fns.read(host)).toBe('1234');
  });
});
