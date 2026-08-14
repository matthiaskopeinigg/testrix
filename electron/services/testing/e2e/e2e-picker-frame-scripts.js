'use strict';

/**
 * Top frame only: relays `postMessage` from OOPIFs / sandboxed CMP iframes to `window.__AW_PICK_BRIDGE__`.
 */
function getRelayBootstrapScript() {
  return `(function relayAwPick(){
  if (window.__awPickRelayV4) return;
  window.__awPickRelayV4 = true;
  window.addEventListener('message', function(ev){
    var d = ev.data;
    if (!d || d.awWorkbenchPick !== true) return;
    try {
      var b = window.__AW_PICK_BRIDGE__;
      var pkg =
        '__AW_SUBFRAME__::' + d.processId + '::' + d.routingId + '::' +
        encodeURIComponent(String(d.selector == null ? '' : d.selector));
      if (b && typeof b.report === 'function') b.report({ selector: pkg });
    } catch (_) {}
  }, true);
})();`;
}

/**
 * @param {{ pickGen: string, isTopFrame: boolean, processId: number, routingId: number }} opts
 */
function compileFramePickerScript(opts) {
  const pickGen = JSON.stringify(String(opts.pickGen));
  const pid = Number(opts.processId);
  const rid = Number(opts.routingId);
  const isTopFrame = !!opts.isTopFrame;

  const hintBlock = isTopFrame
    ? `
  var hint = document.createElement('div');
  hint.id = '__aw-picker-hint';
  hint.className = '__aw-picker-ui';
  hint.setAttribute(
    'style',
    'position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:10px 16px;font:13px/1.4 system-ui,sans-serif;background:rgba(15,23,42,0.92);color:#e2e8f0;text-align:center;pointer-events:none;border-bottom:1px solid rgba(249,115,22,0.5);'
  );
  hint.textContent =
    'Every frame + open Shadow DOM (Usercentrics, etc.) · Iframes: " >>> " · Shadow pierce: " |>| " · Esc cancels';
  document.documentElement.appendChild(hint);
`
    : `
  var hint = null;
`;

  const initReport = isTopFrame
    ? `
  var bridge = window.__AW_PICK_BRIDGE__;
  if (!bridge || typeof bridge.report !== 'function') return;
  function reportPick(sel) { bridge.report({ selector: sel }); }
`
    : `
  function reportPick(sel) {
    try {
      window.top.postMessage({ awWorkbenchPick: true, processId: ${pid}, routingId: ${rid}, selector: sel }, '*');
    } catch (_) {}
  }
`;

  const keydownBlock = isTopFrame
    ? `
  function onKey(e) {
    if (e.key === 'Escape') bridge.cancel();
  }
  window.addEventListener('keydown', onKey, true);
  addDispose(function () {
    try { window.removeEventListener('keydown', onKey, true); } catch (_) {}
  });
`
    : '';

  return `(function AW_PICK_MULTI_FRAME(){
  try {
    if (typeof window.__AW_PICK_TEARDOWN__ === 'function') window.__AW_PICK_TEARDOWN__();
  } catch (_a0) {}

  var PICK_GEN = ${pickGen};
  if (window.__awPickerGen === PICK_GEN) return;
  window.__awPickerGen = PICK_GEN;

  ${initReport}
  ${hintBlock}

  var AW_DEEP = ' >>> ';
  var AW_SHADOW = ' |>| ';
  var disposers = [];

  function addDispose(fn) { disposers.push(fn); }

  function isOurUi(el) {
    if (!el || el.nodeType !== 1) return false;
    if (hint && el === hint) return true;
    if (typeof el.closest === 'function') {
      try { if (el.closest('#__aw-picker-hint')) return true; } catch (_) {}
    }
    if (el.classList && el.classList.contains('__aw-picker-ui')) return true;
    return false;
  }

  function cssEscape(s) {
    if (window.CSS && typeof CSS.escape === 'function') return CSS.escape(String(s));
    return String(s).replace(/[^a-zA-Z0-9_-]/g, '\\\\$&');
  }

  function buildSelectorInDocument(el, scopeDoc) {
    if (!el || el.nodeType !== 1 || !scopeDoc) return '';
    var rootEl = scopeDoc.documentElement;

    function qsa(sel) {
      try { return scopeDoc.querySelectorAll(sel); } catch (_) { return { length: 0 }; }
    }

    if (el.id) {
      var idSel = '#' + cssEscape(el.id);
      try { if (qsa(idSel).length === 1) return idSel; } catch (_) {}
    }

    var testAttrs = ['data-testid', 'data-test', 'data-cy', 'name', 'aria-label'];
    for (var ai = 0; ai < testAttrs.length; ai++) {
      var a = testAttrs[ai];
      var v = el.getAttribute(a);
      if (!v) continue;
      var selAttr = '[' + a + '=' + JSON.stringify(v) + ']';
      try { if (qsa(selAttr).length === 1) return selAttr; } catch (_) {}
    }

    var parts = [];
    var cur = el;
    while (cur && cur.nodeType === 1 && cur !== rootEl) {
      var part = cur.tagName.toLowerCase();
      if (cur.classList && cur.classList.length) {
        var meaningful = [];
        cur.classList.forEach(function (c) {
          if (!String(c).startsWith('__aw') && String(c).length < 48 && meaningful.length < 3) meaningful.push(c);
        });
        for (var ci = 0; ci < meaningful.length; ci++) part += '.' + cssEscape(meaningful[ci]);
      }
      var parentEl = cur.parentElement;
      if (parentEl) {
        var siblings = [].slice.call(parentEl.children);
        var idx = siblings.indexOf(cur);
        if (idx >= 0) part += ':nth-child(' + (idx + 1) + ')';
      }
      parts.unshift(part);
      if (parts.length > 14) break;
      cur = parentEl;
    }
    return parts.join(' > ') || el.tagName.toLowerCase();
  }

  function getFrameChain(forEl) {
    var chain = [];
    var w = forEl && forEl.ownerDocument && forEl.ownerDocument.defaultView;
    while (w && w !== w.top) {
      try {
        var fe = w.frameElement;
        if (!fe) break;
        chain.unshift(fe);
        w = fe.ownerDocument && fe.ownerDocument.defaultView;
      } catch (_) { break; }
    }
    return chain;
  }

  function awIsShadowRootLike(rn) {
    try {
      return rn && rn.nodeType === 11 && !!rn.host;
    } catch (_) {
      return false;
    }
  }

  function buildPathInsideShadowBoundary(el, boundary) {
    if (!el || el.nodeType !== 1 || !boundary) return '';
    var parts = [];
    var cur = el;
    while (cur && cur.nodeType === 1) {
      var part = cur.tagName.toLowerCase();
      if (cur.classList && cur.classList.length) {
        var meaningful = [];
        cur.classList.forEach(function (c) {
          if (!String(c).startsWith('__aw') && String(c).length < 48 && meaningful.length < 3) meaningful.push(c);
        });
        for (var ci = 0; ci < meaningful.length; ci++) part += '.' + cssEscape(meaningful[ci]);
      }
      var parentNode = cur.parentNode;
      if (!parentNode) break;
      var siblings = [].slice.call(parentNode.children || []);
      var idx = siblings.indexOf(cur);
      if (idx >= 0) part += ':nth-child(' + (idx + 1) + ')';
      parts.unshift(part);
      if (parts.length > 14) break;
      if (parentNode === boundary) break;
      cur = parentNode.nodeType === 1 ? parentNode : null;
    }
    return parts.join(' > ') || el.tagName.toLowerCase();
  }

  function buildShadowLeafCompound(el) {
    var rn = el.getRootNode && el.getRootNode();
    if (!awIsShadowRootLike(rn)) {
      return buildSelectorInDocument(el, el.ownerDocument);
    }
    var inner = buildPathInsideShadowBoundary(el, rn);
    var host = rn.host;
    if (!host) return buildSelectorInDocument(el, el.ownerDocument);
    var hostPart = buildShadowLeafCompound(host);
    return hostPart + AW_SHADOW + inner;
  }

  function buildCompoundSelector(el) {
    var frames = getFrameChain(el);
    var parts = [];
    for (var fi = 0; fi < frames.length; fi++) {
      var iframeEl = frames[fi];
      parts.push(buildSelectorInDocument(iframeEl, iframeEl.ownerDocument));
    }
    var leaf = buildShadowLeafCompound(el);
    if (parts.length === 0) return leaf;
    return parts.join(AW_DEEP) + AW_DEEP + leaf;
  }

  /** Hit-test including open ShadowRoot trees (CMP cookie dialogs). OOPIFs still use separate WebFrame injections. */
  function pickDeepComposable(root, x, y) {
    var stack;
    try {
      stack = root.elementsFromPoint(x, y);
    } catch (_) {
      return null;
    }
    var i = 0;
    for (; i < stack.length; i++) {
      var el = stack[i];
      if (!el || el.nodeType !== 1) continue;
      if (isOurUi(el)) continue;
      var tag = el.tagName ? el.tagName.toUpperCase() : '';
      if (tag === 'IFRAME' || tag === 'FRAME') return el;
      var srtry = null;
      try {
        srtry = el.shadowRoot;
      } catch (_s) {}
      if (srtry && srtry.mode === 'open') {
        try {
          var deeper = pickDeepComposable(srtry, x, y);
          if (deeper) return deeper;
        } catch (_) {}
      }
      return el;
    }
    return null;
  }

  var highlighted = null;
  function clearHighlight() {
    if (!highlighted) return;
    highlighted.style.outline = '';
    highlighted.style.outlineOffset = '';
    highlighted.style.boxShadow = '';
    highlighted = null;
  }

  function setHighlight(el) {
    if (highlighted === el) return;
    clearHighlight();
    highlighted = el;
    if (highlighted) {
      highlighted.style.outline = '2px solid rgba(249,115,22,0.95)';
      highlighted.style.outlineOffset = '2px';
      highlighted.style.boxShadow = '0 0 0 1px rgba(249,115,22,0.5)';
    }
  }

  var forDoc = document;

  function onMove(ev) {
    setHighlight(pickDeepComposable(forDoc, ev.clientX, ev.clientY));
  }
  function onClick(ev) {
    var pel = pickDeepComposable(forDoc, ev.clientX, ev.clientY);
    if (!pel) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
    reportPick(buildCompoundSelector(pel));
  }

  forDoc.addEventListener('mousemove', onMove, true);
  forDoc.addEventListener('pointermove', onMove, true);
  forDoc.addEventListener('click', onClick, true);
  addDispose(function () {
    try {
      forDoc.removeEventListener('mousemove', onMove, true);
      forDoc.removeEventListener('pointermove', onMove, true);
      forDoc.removeEventListener('click', onClick, true);
    } catch (_) {}
  });

  ${keydownBlock}

  window.__AW_PICK_TEARDOWN__ = function () {
    var zi = disposers.length;
    while (zi--) {
      try { disposers[zi](); } catch (_) {}
    }
    disposers = [];
    clearHighlight();
    if (hint && hint.parentNode) hint.parentNode.removeChild(hint);
    try { delete window.__AW_PICK_TEARDOWN__; } catch (_) {}
    try { delete window.__awPickerGen; } catch (_) {}
  };
})();`;
}

module.exports = { getRelayBootstrapScript, compileFramePickerScript };
