import type { DynamicVariableCatalogItem } from '@shared/dynamic-variables';

import type { TxCodeEditorLanguage } from './tx-code-editor-language';

const TEMPLATE_TOKEN_PATTERN = /\$([a-zA-Z][a-zA-Z0-9]*)(\(\d*\))?|\{\{([\w.-]+)\}\}/g;
const TX_VAR_SLOT_PREFIX = '\uE000txv';
const TX_VAR_SLOT_SUFFIX = '\uE001';
/** HTML comment placeholders survive JSON highlighting after escape. */
const TX_VAR_HTML_COMMENT_PREFIX = '<!--txv';

export function escapeCodeEditorHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function highlightJson(html: string): string {
  return html.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = 'token-number';
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? 'token-key' : 'token-string';
      } else if (/true|false/.test(match)) {
        cls = 'token-boolean';
      } else if (/null/.test(match)) {
        cls = 'token-null';
      }
      return `<span class="${cls}">${match}</span>`;
    },
  );
}

/** Quoted attribute value after {@link escapeCodeEditorHtml} (`class=&quot;a&amp;b&quot;`). */
const ESCAPED_QUOTED_ATTR =
  '&quot;(?:&(?:[a-zA-Z][a-zA-Z0-9]*|#\\d+);|[^&])*?&quot;';

const ESCAPED_MARKUP_TAG_RE = new RegExp(
  `&lt;(/?)([a-zA-Z][a-zA-Z0-9_\\-:]*)(` +
    `(?:\\s+[a-zA-Z][a-zA-Z0-9_\\-:]*(?:\\s*=\\s*(?:${ESCAPED_QUOTED_ATTR}|&#39;(?:&(?:[a-zA-Z][a-zA-Z0-9]*|#\\d+);|[^&])*?&#39;|[^\\s&gt;]+))?)*` +
    `\\s*)?/?&gt;`,
  'g',
);

function highlightEscapedMarkupAttributes(attrPart: string): string {
  if (!attrPart.trim()) {
    return '';
  }
  return attrPart.replace(
    /\s+([a-zA-Z][a-zA-Z0-9_\-:]*)(?:\s*=\s*(&quot;(?:&(?:[a-zA-Z][a-zA-Z0-9]*|#\d+);|[^&])*?&quot;|&#39;(?:&(?:[a-zA-Z][a-zA-Z0-9]*|#\d+);|[^&])*?&#39;|(\S+)))?/g,
    (_, name: string, quoted?: string, bare?: string) => {
      const value = quoted ?? bare ?? '';
      const valueHtml = value ? `=<span class="token-string">${value}</span>` : '';
      return ` <span class="token-attribute">${name}</span>${valueHtml}`;
    },
  );
}

function wrapEscapedMarkupTag(_match: string, slash: string, tagName: string, attrPart: string): string {
  const attrs = highlightEscapedMarkupAttributes(attrPart ?? '');
  const slashSpan = slash ? `<span class="token-keyword">${slash}</span>` : '';
  return (
    `<span class="token-keyword">&lt;</span>${slashSpan}` +
    `<span class="token-keyword">${tagName}</span>${attrs}<span class="token-keyword">&gt;</span>`
  );
}

/**
 * HTML/XML markup highlighting on already-escaped mirror HTML.
 * Highlights comments, doctype, tags/attributes, and CSS/SCSS/JS inside style/script blocks.
 */
export function highlightHtml(html: string): string {
  const slots: string[] = [];
  const push = (wrapped: string): string => stashToken(slots, wrapped, 'txhtml');

  let s = html;

  s = s.replace(/&lt;!--[\s\S]*?--&gt;/g, (m) => push(`<span class="token-comment">${m}</span>`));
  s = s.replace(/&lt;!\[CDATA\[[\s\S]*?\]\]&gt;/g, (m) => push(`<span class="token-comment">${m}</span>`));
  s = s.replace(/&lt;!DOCTYPE[^&]*&gt;/gi, (m) => push(`<span class="token-keyword">${m}</span>`));
  s = s.replace(/&lt;\?[\s\S]*?\?&gt;/g, (m) => push(`<span class="token-comment">${m}</span>`));

  s = s.replace(
    /(&lt;style\b(?:(?!&lt;\/style&gt;)[\s\S])*?&gt;)([\s\S]*?)(&lt;\/style&gt;)/gi,
    (_, open, inner, close) => {
      const highlightInner = /\$[\w-]+|@mixin\b|@include\b|@use\b|@forward\b/.test(inner)
        ? highlightScss
        : highlightCss;
      return push(
        `<span class="token-keyword">${open}</span>${highlightInner(inner)}<span class="token-keyword">${close}</span>`,
      );
    },
  );

  s = s.replace(/(&lt;script\b(?:(?!&lt;\/script&gt;)[\s\S])*?&gt;)([\s\S]*?)(&lt;\/script&gt;)/gi, (_, open, inner, close) =>
    push(
      `<span class="token-keyword">${open}</span>${highlightJavaScript(inner)}<span class="token-keyword">${close}</span>`,
    ),
  );

  s = s.replace(ESCAPED_MARKUP_TAG_RE, (match, slash: string, tagName: string, attrPart: string) =>
    push(wrapEscapedMarkupTag(match, slash, tagName, attrPart ?? '')),
  );

  return restoreTokens(s, slots, 'txhtml');
}

/** @deprecated Prefer {@link highlightHtml}; kept for callers that only need tag-level XML tones. */
export function highlightXml(html: string): string {
  return highlightHtml(html);
}

/** HTML comment placeholders — invisible to CSS/GraphQL highlighter regexes. */
function stashToken(slots: string[], wrapped: string, prefix: string): string {
  slots.push(wrapped);
  return `<!--${prefix}${slots.length - 1}-->`;
}

function restoreTokens(html: string, slots: string[], prefix: string): string {
  return html.replace(new RegExp(`<!--${prefix}(\\d+)-->`, 'g'), (_, i) => slots[Number(i)] ?? '');
}

export function highlightGraphql(html: string): string {
  const slots: string[] = [];
  const push = (wrapped: string): string => stashToken(slots, wrapped, 'txgq');

  let s = html;
  s = s.replace(/#.*$/gm, (m) => push(`<span class="token-comment">${m}</span>`));
  s = s.replace(/"(?:[^"\\]|\\.)*"/g, (m) => push(`<span class="token-string">${m}</span>`));
  s = s.replace(/\$[a-zA-Z_][a-zA-Z0-9_]*/g, (m) => push(`<span class="token-attribute">${m}</span>`));

  const keywords =
    'query|mutation|subscription|fragment|on|type|interface|union|enum|scalar|input|implements|extend|schema|directive|repeatable';
  s = s.replace(new RegExp(`\\b(${keywords})\\b`, 'g'), (m) => `<span class="token-keyword">${m}</span>`);

  return restoreTokens(s, slots, 'txgq');
}

/** JS/TS highlighter uses `data-tok` so keyword regexes do not match nested spans. */
function highlightScriptLike(html: string, extraKeywords: string): string {
  const baseKeywords =
    'break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|false|finally|for|function|if|import|in|instanceof|new|null|return|super|switch|this|throw|true|try|typeof|var|void|while|let|static|yield|await|async';
  const keywords = extraKeywords ? `${baseKeywords}|${extraKeywords}` : baseKeywords;

  return html
    .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*)"/g, (m) => `<span data-tok="s">${m}</span>`)
    .replace(/('(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\'])*')/g, (m) => `<span data-tok="s">${m}</span>`)
    .replace(/(`[^`]*`)/g, (m) => `<span data-tok="s">${m}</span>`)
    .replace(/(\/\/.*)/g, (m) => `<span data-tok="c">${m}</span>`)
    .replace(new RegExp(`\\b(${keywords})\\b`, 'g'), (m) => `<span data-tok="k">${m}</span>`)
    .replace(/\b(\d+(?:\.\d+)?)\b/g, (m) => `<span data-tok="n">${m}</span>`)
    .replace(/(\w+)(?=\()/g, (m) => `<span data-tok="f">${m}</span>`);
}

export function highlightJavaScript(html: string): string {
  return highlightScriptLike(html, '');
}

export function highlightTypeScript(html: string): string {
  const tsKeywords =
    'type|interface|enum|implements|namespace|readonly|keyof|infer|declare|abstract|as|satisfies|public|private|protected|override|module|from|of';
  return highlightScriptLike(html, tsKeywords);
}

export function highlightCss(html: string): string {
  const slots: string[] = [];
  const push = (wrapped: string): string => stashToken(slots, wrapped, 'txcss');

  let s = html;
  s = s.replace(/\/\*[\s\S]*?\*\//g, (m) => push(`<span class="token-comment">${m}</span>`));
  s = s.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, (m) => push(`<span class="token-string">${m}</span>`));
  s = s.replace(/#[0-9a-fA-F]{3,8}\b/g, (m) => push(`<span class="token-number">${m}</span>`));
  s = s.replace(/\b(\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms)?)\b/g, (m) => `<span class="token-number">${m}</span>`);
  s = s.replace(
    /([.#][\w-]+|\w[\w-]*)(?=\s*[{,])/g,
    (m) => `<span class="token-key">${m}</span>`,
  );
  s = s.replace(/([\w-]+)(?=\s*:)/g, (m) => `<span class="token-attribute">${m}</span>`);
  s = s.replace(/@(import|media|keyframes|charset|layer|font-face)\b/g, (m) => `<span class="token-keyword">${m}</span>`);

  return restoreTokens(s, slots, 'txcss');
}

export function highlightScss(html: string): string {
  const varSlots: string[] = [];
  let s = html.replace(/\$[\w-]+/g, (m) =>
    stashToken(varSlots, `<span class="token-attribute">${m}</span>`, 'txscss'),
  );
  s = highlightCss(s);
  s = s.replace(
    /@(use|forward|mixin|include|extend|function|return|if|else|each|for|while|debug|warn|error)\b/g,
    (m) => `<span class="token-keyword">${m}</span>`,
  );
  return restoreTokens(s, varSlots, 'txscss');
}

function stashTemplateVariableSlots(
  text: string,
  catalog: readonly DynamicVariableCatalogItem[],
  slots: string[],
): string {
  return text.replace(TEMPLATE_TOKEN_PATTERN, (match, dollarName?: string, paramGroup?: string, braceKey?: string) => {
    if (dollarName === undefined && braceKey === undefined) {
      return match;
    }
    slots.push(buildTemplateVariableSpanHtml(match, dollarName, paramGroup, braceKey, catalog));
    return `${TX_VAR_SLOT_PREFIX}${slots.length - 1}${TX_VAR_SLOT_SUFFIX}`;
  });
}

function restoreTemplateVariableSlots(html: string, slots: string[]): string {
  return html.replace(
    new RegExp(`${TX_VAR_SLOT_PREFIX}(\\d+)${TX_VAR_SLOT_SUFFIX}`, 'g'),
    (_, index) => slots[Number(index)] ?? '',
  );
}

function stashTemplateVariableSlotsAsHtmlComments(
  text: string,
  catalog: readonly DynamicVariableCatalogItem[],
  slots: string[],
): string {
  return text.replace(TEMPLATE_TOKEN_PATTERN, (match, dollarName?: string, paramGroup?: string, braceKey?: string) => {
    slots.push(buildTemplateVariableSpanHtml(match, dollarName, paramGroup, braceKey, catalog));
    return `${TX_VAR_HTML_COMMENT_PREFIX}${slots.length - 1}-->`;
  });
}

function restoreTemplateVariableHtmlCommentSlots(html: string, slots: string[]): string {
  return html.replace(/&lt;!--txv(\d+)--&gt;/g, (_, index) => slots[Number(index)] ?? '');
}

function buildTemplateVariableSpanHtml(
  match: string,
  dollarName: string | undefined,
  paramGroup: string | undefined,
  braceKey: string | undefined,
  catalog: readonly DynamicVariableCatalogItem[],
): string {
  const knownDollarIds = new Set(
    catalog.filter((entry) => entry.insert.startsWith('$')).map((entry) => entry.id),
  );
  const knownEnvKeys = new Set(
    catalog
      .filter((entry) => entry.insert.startsWith('{{') && entry.insert.endsWith('}}'))
      .map((entry) => entry.insert.slice(2, -2)),
  );

  if (dollarName !== undefined) {
    const known = knownDollarIds.has(dollarName);
    const tokenText = `$${dollarName}`;
    let wrapped = `<span class="tx-var-token${known ? '' : ' tx-var-token--unknown'}" data-var-id="${escapeAttr(dollarName)}" data-var-part="token">${escapeHtml(tokenText)}</span>`;
    if (paramGroup !== undefined) {
      wrapped += `<span class="tx-var-param" data-var-id="${escapeAttr(dollarName)}" data-var-part="param">${escapeHtml(paramGroup)}</span>`;
    }
    return wrapped;
  }
  if (braceKey !== undefined) {
    const known = knownEnvKeys.has(braceKey);
    const varId = `env:${braceKey}`;
    return `<span class="tx-var-token tx-var-token--env${known ? '' : ' tx-var-token--unknown'}" data-var-id="${escapeAttr(varId)}" data-var-part="token">${escapeHtml(match)}</span>`;
  }
  return escapeHtml(match);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll("'", '&#39;');
}

function highlightJsonWithTemplateVariables(
  text: string,
  catalog: readonly DynamicVariableCatalogItem[],
): string {
  const varSlots: string[] = [];
  const source = stashTemplateVariableSlotsAsHtmlComments(text, catalog, varSlots);
  let html = escapeCodeEditorHtml(source);
  html = highlightJson(html);
  html = restoreTemplateVariableHtmlCommentSlots(html, varSlots);
  if (text.endsWith('\n')) {
    html += '<br>';
  }
  return html;
}

export function highlightCodeEditorContent(
  text: string,
  language: TxCodeEditorLanguage,
  catalog: readonly DynamicVariableCatalogItem[] = [],
): string {
  if (!text) {
    return '';
  }

  const useCatalog = catalog.length > 0;
  if (useCatalog && language === 'json') {
    return highlightJsonWithTemplateVariables(text, catalog);
  }

  const varSlots: string[] = [];
  let source = useCatalog ? stashTemplateVariableSlots(text, catalog, varSlots) : text;

  if (language === 'plaintext') {
    let html = useCatalog ? restoreTemplateVariableSlots(escapeCodeEditorHtml(source), varSlots) : escapeCodeEditorHtml(text);
    if (text.endsWith('\n')) {
      html += '<br>';
    }
    return html;
  }

  let html = escapeCodeEditorHtml(source);
  switch (language) {
    case 'json':
      html = highlightJson(html);
      break;
    case 'xml':
    case 'html':
      html = highlightHtml(html);
      break;
    case 'graphql':
      html = highlightGraphql(html);
      break;
    case 'js':
      html = highlightJavaScript(html);
      break;
    case 'ts':
      html = highlightTypeScript(html);
      break;
    case 'css':
      html = highlightCss(html);
      break;
    case 'scss':
      html = highlightScss(html);
      break;
    default:
      break;
  }

  if (useCatalog) {
    html = restoreTemplateVariableSlots(html, varSlots);
  }

  if (text.endsWith('\n')) {
    html += '<br>';
  }
  return html;
}
