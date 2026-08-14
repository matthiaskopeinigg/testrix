import { expandPrettyJsonEmptyCollections } from './json-empty-collection-expand';
import type { TxCodeEditorLanguage } from './tx-code-editor-language';

/**
 * Parses JSON for format-on-paste / pretty-print. Accepts strict JSON plus common paste fragments:
 * trailing commas, commas before closing braces, and comma-separated objects without a wrapping array.
 */
export function tryParseJsonLenient(trimmed: string): unknown | null {
  const parseOrNull = (s: string): unknown | null => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };

  const candidates: string[] = [];
  const addCandidate = (s: string): void => {
    const t = s.trim();
    if (t && !candidates.includes(t)) {
      candidates.push(t);
    }
  };

  addCandidate(trimmed);
  addCandidate(trimmed.replace(/,\s*$/, ''));

  let relaxed = trimmed.trim();
  for (let i = 0; i < 64; i++) {
    const next = relaxed.replace(/,\s*\}\s*$/, '}').replace(/,\s*\]\s*$/, ']');
    if (next === relaxed) {
      break;
    }
    relaxed = next;
    addCandidate(relaxed);
  }

  for (const c of candidates) {
    const v = parseOrNull(c);
    if (v !== null) {
      return v;
    }
  }

  const inner = relaxed.replace(/,\s*$/, '').trim();
  const firstNonWs = inner.search(/\S/);
  if (firstNonWs === -1 || inner[firstNonWs] === '[') {
    return null;
  }
  if (inner[firstNonWs] !== '{') {
    return null;
  }
  if (!/\}\s*,\s*\{/.test(inner)) {
    return null;
  }
  const arrayWrapped = `[${inner.replace(/,\s*$/, '')}]`;
  return parseOrNull(arrayWrapped);
}

function escapeXmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeXmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatXmlElement(el: Element, depth: number): string {
  const pad = '  '.repeat(depth);
  const name = el.tagName;
  let attrStr = '';
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes[i]!;
    attrStr += ` ${a.name}="${escapeXmlAttr(a.value)}"`;
  }
  const childNodes = Array.from(el.childNodes);
  const hasChildElements = childNodes.some((c) => c.nodeType === Node.ELEMENT_NODE);

  if (childNodes.length === 0) {
    return `${pad}<${name}${attrStr}/>\n`;
  }

  if (!hasChildElements) {
    const inner = el.textContent ?? '';
    return `${pad}<${name}${attrStr}>${escapeXmlText(inner)}</${name}>\n`;
  }

  let out = `${pad}<${name}${attrStr}>\n`;
  const innerPad = '  '.repeat(depth + 1);
  for (const c of childNodes) {
    if (c.nodeType === Node.ELEMENT_NODE) {
      out += formatXmlElement(c as Element, depth + 1);
    } else if (c.nodeType === Node.TEXT_NODE) {
      const t = c.textContent || '';
      if (t.trim()) {
        out += `${innerPad}${escapeXmlText(t)}\n`;
      }
    } else if (c.nodeType === Node.COMMENT_NODE) {
      out += `${innerPad}<!--${(c as Comment).data}-->\n`;
    } else if (c.nodeType === Node.CDATA_SECTION_NODE) {
      out += `${innerPad}<![CDATA[${(c as CDATASection).data}]]>\n`;
    }
  }
  out += `${pad}</${name}>\n`;
  return out;
}

function tryFormatXml(trimmed: string): string | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(trimmed, 'application/xml');
  if (doc.querySelector('parsererror')) {
    return null;
  }
  const declMatch = trimmed.match(/^<\?xml[\s\S]*?\?>\s*/);
  const decl = declMatch ? declMatch[0].replace(/\s+$/, '') + '\n' : '';
  const root = doc.documentElement;
  if (!root) {
    return null;
  }
  const body = formatXmlElement(root, 0).replace(/\s+$/, '');
  return decl ? decl + body : body;
}

/** Returns pretty-printed body or null if unsupported or content is not yet valid. */
export function tryFormatCodeEditorContent(
  raw: string,
  language: TxCodeEditorLanguage,
): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  if (language === 'json' || language === 'graphql') {
    const parsed = tryParseJsonLenient(trimmed);
    if (parsed === null) {
      return null;
    }
    let pretty = JSON.stringify(parsed, null, 2);
    if (language === 'json') {
      pretty = expandPrettyJsonEmptyCollections(pretty);
    }
    return pretty;
  }

  if (language === 'xml') {
    return tryFormatXml(trimmed);
  }

  if (language === 'html') {
    return tryFormatHtml(trimmed);
  }

  return null;
}

function tryFormatHtml(trimmed: string): string | null {
  const asXml = tryFormatXml(trimmed);
  if (asXml !== null) {
    return asXml;
  }

  const doc = new DOMParser().parseFromString(trimmed, 'text/html');
  if (doc.querySelector('parsererror')) {
    return null;
  }

  const parts: string[] = [];
  const doctype = trimmed.match(/<!DOCTYPE[^>]*>/i);
  if (doctype) {
    parts.push(doctype[0]);
  }

  for (const node of Array.from(doc.body.childNodes)) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      parts.push(formatXmlElement(node as Element, 0).trimEnd());
    } else if (node.nodeType === Node.COMMENT_NODE) {
      parts.push(`<!--${(node as Comment).data}-->`);
    }
  }

  const joined = parts.join('\n').trim();
  return joined && joined !== trimmed ? joined : null;
}
