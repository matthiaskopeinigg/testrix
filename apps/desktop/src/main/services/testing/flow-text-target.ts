/**
 * Page-script helpers for Type.
 * A selector such as `#ang-otp` often matches a custom element. The pin has to
 * land in the inner input, using the native value setter so the control sees it.
 */

/** Injected into the page next to `__txQuery`. */
export const FLOW_TEXT_TARGET_FNS = `function __txFindEditable(root) {
  function editable(node) {
    if (!node || node.nodeType !== 1) return false;
    var tag = String(node.tagName || '').toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'input') {
      var type = String((node.getAttribute && node.getAttribute('type')) || 'text').toLowerCase();
      return type !== 'hidden' && type !== 'checkbox' && type !== 'radio' && type !== 'button' && type !== 'submit' && type !== 'file' && type !== 'image' && type !== 'reset';
    }
    return !!node.isContentEditable;
  }
  function walk(node) {
    if (!node) return null;
    if (editable(node)) return node;
    var light = node.querySelectorAll ? node.querySelectorAll('input, textarea, [contenteditable]') : [];
    for (var i = 0; i < light.length; i++) {
      if (editable(light[i])) return light[i];
    }
    var all = node.querySelectorAll ? node.querySelectorAll('*') : [];
    for (var j = 0; j < all.length; j++) {
      if (all[j].shadowRoot) {
        var nested = walk(all[j].shadowRoot);
        if (nested) return nested;
      }
    }
    if (node.shadowRoot) {
      var shadowHit = walk(node.shadowRoot);
      if (shadowHit) return shadowHit;
    }
    return null;
  }
  return walk(root);
}
function __txEmitInput(el, text) {
  if (!el || typeof el.dispatchEvent !== 'function') return;
  var inputEvt;
  var changeEvt;
  try {
    inputEvt = typeof InputEvent === 'function'
      ? new InputEvent('input', { bubbles: true, composed: true, data: text, inputType: 'insertText' })
      : new Event('input', { bubbles: true });
  } catch (err) {
    inputEvt = { type: 'input', bubbles: true };
  }
  try {
    changeEvt = typeof Event === 'function' ? new Event('change', { bubbles: true }) : { type: 'change', bubbles: true };
  } catch (err2) {
    changeEvt = { type: 'change', bubbles: true };
  }
  el.dispatchEvent(inputEvt);
  el.dispatchEvent(changeEvt);
}
function __txSetControlValue(el, text) {
  var tag = String(el.tagName || '').toLowerCase();
  var Ctor = null;
  try {
    Ctor = tag === 'textarea' && typeof HTMLTextAreaElement === 'function'
      ? HTMLTextAreaElement
      : (typeof HTMLInputElement === 'function' ? HTMLInputElement : null);
  } catch (err) {
    Ctor = null;
  }
  var desc = null;
  try {
    desc = Ctor ? Object.getOwnPropertyDescriptor(Ctor.prototype, 'value') : null;
  } catch (err2) {
    desc = null;
  }
  if (desc && typeof desc.set === 'function') desc.set.call(el, text);
  else el.value = text;
  __txEmitInput(el, text);
}
function __txWriteFlowText(host, text, clear) {
  var el = __txFindEditable(host);
  if (!el) {
    if (!host) return false;
    host.textContent = clear ? String(text) : String(host.textContent || '') + String(text);
    return true;
  }
  if (typeof el.focus === 'function') el.focus();
  if (el.isContentEditable) {
    var current = String(el.textContent || '');
    el.textContent = clear ? String(text) : current + String(text);
    __txEmitInput(el, text);
    return true;
  }
  var currentValue = String(el.value || '');
  __txSetControlValue(el, clear ? String(text) : currentValue + String(text));
  return true;
}
function __txReadFlowText(host) {
  var el = __txFindEditable(host);
  if (!el) return null;
  if (el.isContentEditable) return String(el.textContent || '');
  return String(el.value == null ? '' : el.value);
}
function __txFocusFlowText(host) {
  var el = __txFindEditable(host) || host;
  if (!el) return false;
  if (typeof el.focus === 'function') el.focus();
  return true;
}`;

export type FlowTextPageAction = 'read' | 'focus' | 'write';

/** Builds a page script that reads, focuses, or writes the editable for `selector`. */
export function flowTextPageScript(
  queryHelper: string,
  selector: string,
  action: FlowTextPageAction,
  text = '',
  clear = true,
): string {
  const quoted = JSON.stringify(selector);
  if (action === 'read') {
    return `(() => { ${queryHelper} ${FLOW_TEXT_TARGET_FNS} const host = __txQuery(${quoted}); if (!host) return null; return __txReadFlowText(host); })()`;
  }
  if (action === 'focus') {
    return `(() => { ${queryHelper} ${FLOW_TEXT_TARGET_FNS} const host = __txQuery(${quoted}); if (!host) return false; return __txFocusFlowText(host); })()`;
  }
  return `(() => { ${queryHelper} ${FLOW_TEXT_TARGET_FNS} const host = __txQuery(${quoted}); if (!host) return false; return __txWriteFlowText(host, ${JSON.stringify(text)}, ${clear ? 'true' : 'false'}); })()`;
}
