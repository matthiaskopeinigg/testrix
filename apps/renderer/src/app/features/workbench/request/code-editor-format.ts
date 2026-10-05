import { GraphQLError } from 'graphql/error';
import { parse, print } from 'graphql/language';

import type { CodeEditorLanguage } from './code-editor-language';

const PLACEHOLDER_RE = /\{\{[^{}]*\}\}|\$[A-Za-z][A-Za-z0-9]*(?:\([^)]*\))?/g;
const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

export interface MaskedSource {
  readonly text: string;
  readonly tokens: readonly string[];
}

export interface CodeDiagnostic {
  readonly from: number;
  readonly to: number;
  readonly message: string;
  readonly severity: 'error';
}

export function maskPlaceholders(source: string): MaskedSource {
  const tokens: string[] = [];
  const text = source.replace(PLACEHOLDER_RE, (match) => {
    const index = tokens.length;
    tokens.push(match);
    return `__TXPH_${index}__`;
  });
  return { text, tokens };
}

export function unmaskPlaceholders(text: string, tokens: readonly string[]): string {
  let next = text;
  for (let index = tokens.length - 1; index >= 0; index -= 1)
    next = next.split(`__TXPH_${index}__`).join(tokens[index] ?? '');
  return next;
}

/** Past this many characters a response is shown as received so the UI stays responsive. */
export const RESPONSE_FORMAT_LIMIT = 2_000_000;

/** Pretty-prints a response body, leaving very large ones untouched. */
export function formatResponseBody(body: string, language: CodeEditorLanguage): string {
  if (body.length > RESPONSE_FORMAT_LIMIT)
    return body;
  return formatCode(body, language);
}

export function formatCode(source: string, language: CodeEditorLanguage): string {
  if (!source.trim() || language === 'text' || language === 'javascript' || language === 'css')
    return source;
  if (language === 'json')
    return formatJson(source);
  if (language === 'graphql')
    return formatGraphql(source);
  return formatMarkup(source, language === 'html');
}

export function lintCode(source: string, language: CodeEditorLanguage): CodeDiagnostic[] {
  if (!source.trim() || language === 'text' || language === 'javascript' || language === 'css')
    return [];
  if (language === 'json')
    return lintJson(source);
  if (language === 'graphql')
    return lintGraphql(source);
  return lintMarkup(source, language === 'html');
}

function formatJson(source: string): string {
  const masked = maskPlaceholders(source);
  try {
    const pretty = `${JSON.stringify(JSON.parse(jsonReady(masked.text)), null, 2)}\n`;
    return unmaskPlaceholders(pretty, masked.tokens);
  } catch {
    return source;
  }
}

function formatGraphql(source: string): string {
  const masked = maskPlaceholders(source);
  try {
    return unmaskPlaceholders(`${print(parse(masked.text))}\n`, masked.tokens);
  } catch {
    return source;
  }
}

function formatMarkup(source: string, html: boolean): string {
  const masked = maskPlaceholders(source);
  const parts = masked.text.split(/(<[^>]+>)/);
  const lines: string[] = [];
  let indent = 0;
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed)
      continue;
    const closing = isCloseTag(trimmed);
    const selfClosing = isSelfClosing(trimmed, html);
    const opening = isOpenTag(trimmed) && !selfClosing && !closing;
    if (closing)
      indent = Math.max(0, indent - 1);
    lines.push(`${'  '.repeat(indent)}${trimmed}`);
    if (opening)
      indent += 1;
  }
  const formatted = lines.length === 0 ? masked.text : `${lines.join('\n')}\n`;
  return unmaskPlaceholders(formatted, masked.tokens);
}

function lintJson(source: string): CodeDiagnostic[] {
  const masked = maskPlaceholders(source);
  try {
    JSON.parse(jsonReady(masked.text));
    return [];
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON';
    const from = jsonErrorPos(message, source.length);
    return [{ from, to: Math.min(source.length, from + 1), message, severity: 'error' }];
  }
}

function lintGraphql(source: string): CodeDiagnostic[] {
  const masked = maskPlaceholders(source);
  try {
    parse(masked.text);
    return [];
  } catch (error) {
    if (error instanceof GraphQLError) {
      const from = error.positions?.[0] ?? 0;
      return [{
        from: Math.min(from, Math.max(0, source.length - 1)),
        to: Math.min(source.length, from + 1),
        message: error.message,
        severity: 'error',
      }];
    }
    const message = error instanceof Error ? error.message : 'Invalid GraphQL';
    return [{ from: 0, to: Math.min(1, source.length), message, severity: 'error' }];
  }
}

function lintMarkup(source: string, html: boolean): CodeDiagnostic[] {
  const masked = maskPlaceholders(source);
  const stack: { name: string; from: number }[] = [];
  const tagRe = /<\/?([A-Za-z][\w:-]*)[^>]*>/g;
  let match = tagRe.exec(masked.text);
  while (match) {
    const raw = match[0] ?? '';
    const name = (match[1] ?? '').toLowerCase();
    const from = match.index;
    if (raw.startsWith('</')) {
      const open = stack.pop();
      if (!open || open.name !== name) {
        return [{
          from,
          to: from + raw.length,
          message: open ? `Expected </${open.name}>` : `Unexpected </${name}>`,
          severity: 'error',
        }];
      }
    } else if (!isSelfClosing(raw, html)) {
      stack.push({ name, from });
    }
    match = tagRe.exec(masked.text);
  }
  const leftover = stack[stack.length - 1];
  if (!leftover)
    return [];
  return [{
    from: leftover.from,
    to: Math.min(masked.text.length, leftover.from + leftover.name.length + 2),
    message: `Unclosed <${leftover.name}>`,
    severity: 'error',
  }];
}

function jsonReady(masked: string): string {
  return masked
    .replace(/(:\s*)(__TXPH_\d+__)/g, '$1"$2"')
    .replace(/([[,]\s*)(__TXPH_\d+__)/g, '$1"$2"');
}

function jsonErrorPos(message: string, length: number): number {
  const match = message.match(/position\s+(\d+)/i);
  if (!match)
    return 0;
  const pos = Number.parseInt(match[1] ?? '0', 10);
  if (!Number.isFinite(pos))
    return 0;
  return Math.max(0, Math.min(length, pos));
}

function isCloseTag(part: string): boolean {
  return part.startsWith('</');
}

function isOpenTag(part: string): boolean {
  return part.startsWith('<') && !part.startsWith('</') && !part.startsWith('<!') && !part.startsWith('<?');
}

function isSelfClosing(part: string, html: boolean): boolean {
  if (!isOpenTag(part) || isCloseTag(part))
    return false;
  if (part.endsWith('/>'))
    return true;
  if (!html)
    return false;
  const name = part.match(/^<\/?([A-Za-z][\w:-]*)/)?.[1]?.toLowerCase() ?? '';
  return VOID_TAGS.has(name);
}
