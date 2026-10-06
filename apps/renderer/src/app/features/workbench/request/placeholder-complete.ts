import { PLACEHOLDER_CATALOG } from '@testrix/contracts';

import {
  hintForVariableOrigin,
  originForName,
  type PlaceholderOrigin,
} from './placeholder-origin';

export interface PlaceholderSuggestion {
  readonly insert: string;
  readonly label: string;
  readonly detail: string;
}

export interface PlaceholderToken {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly kind: 'dollar' | 'mustache' | 'none';
}

export function tokenAtCaret(value: string, cursor: number): PlaceholderToken {
  const index = Math.max(0, Math.min(cursor, value.length));
  const mustacheStart = value.lastIndexOf('{{', index);
  if (mustacheStart >= 0) {
    const close = value.indexOf('}}', mustacheStart + 2);
    if (close === -1) {
      let end = index;
      while (end < value.length && isTokenChar(value[end] ?? ''))
        end += 1;
      return {
        start: mustacheStart,
        end,
        text: value.slice(mustacheStart, end),
        kind: 'mustache',
      };
    }
    if (index < close + 2) {
      return {
        start: mustacheStart,
        end: close + 2,
        text: value.slice(mustacheStart, close + 2),
        kind: 'mustache',
      };
    }
  }
  let start = index;
  while (start > 0 && isTokenChar(value[start - 1] ?? ''))
    start -= 1;
  if (start > 0 && value[start - 1] === '$')
    start -= 1;
  let end = index;
  while (end < value.length && isTokenChar(value[end] ?? ''))
    end += 1;
  const textBase = value.slice(start, end);
  if (textBase.startsWith('$') || (start < index && value[start] === '$')) {
    if (value[end] === '(') {
      const close = value.indexOf(')', end + 1);
      end = close === -1 ? value.length : close + 1;
    }
    return { start, end, text: value.slice(start, end), kind: 'dollar' };
  }
  return { start: index, end: index, text: '', kind: 'none' };
}

export function suggestPlaceholders(
  value: string,
  cursor: number,
  variables: readonly string[],
): PlaceholderSuggestion[] {
  const token = tokenAtCaret(value, cursor);
  const catalog = PLACEHOLDER_CATALOG.map((item) => ({
    insert: item.insert,
    label: item.label,
    detail: item.detail,
  }));
  const vars = uniqueNames(variables).map((name) => ({
    insert: `{{${name}}}`,
    label: `{{${name}}}`,
    detail: 'variable',
  }));
  const pool = token.kind === 'dollar' ? catalog : token.kind === 'mustache' ? vars : [...catalog, ...vars];
  const needle = needleOf(token);
  const kind: 'dollar' | 'mustache' = token.kind === 'mustache' ? 'mustache' : 'dollar';
  const items = needle ? pool.filter((item) => matchRank(item, needle, kind) < 99) : pool;
  return items.sort((left, right) => {
    const delta = matchRank(left, needle, kind) - matchRank(right, needle, kind);
    if (delta !== 0)
      return delta;
    return left.insert.localeCompare(right.insert);
  });
}

export function applyPlaceholderSuggestion(
  value: string,
  cursor: number,
  insert: string,
): { readonly value: string; readonly cursor: number } {
  const token = tokenAtCaret(value, cursor);
  const start = token.kind === 'none' ? cursor : token.start;
  const end = token.kind === 'none' ? cursor : token.end;
  const text = normalizePlaceholderInsert(insert, token, value, start, end);
  const next = `${value.slice(0, start)}${text}${value.slice(end)}`;
  return { value: next, cursor: start + text.length };
}

/** Prefer a balanced `{{name}}` / `$token` even when the caret sits inside partial braces. */
function normalizePlaceholderInsert(
  insert: string,
  token: PlaceholderToken,
  value: string,
  start: number,
  _end: number,
): string {
  if (insert.startsWith('{{') && insert.endsWith('}}'))
    return insert;
  if (insert.startsWith('$'))
    return insert;
  if (token.kind === 'mustache' || value.slice(start, start + 2) === '{{')
    return `{{${insert}}}`;
  if (token.kind === 'dollar' || value[start] === '$')
    return insert.startsWith('$') ? insert : `$${insert}`;
  return insert;
}

function uniqueNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed || seen.has(trimmed))
      continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out.sort((left, right) => left.localeCompare(right));
}

function needleOf(token: PlaceholderToken): string {
  if (token.kind === 'none')
    return '';
  if (token.kind === 'mustache')
    return token.text.replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '').toLowerCase();
  return token.text.replace(/^\$/, '').replace(/\(.*\)$/, '').toLowerCase();
}

function identifierOf(item: PlaceholderSuggestion, kind: 'dollar' | 'mustache'): string {
  if (kind === 'mustache' || item.insert.startsWith('{{'))
    return item.insert.replace(/^\{\{/, '').replace(/\}\}$/, '');
  return item.insert.replace(/^\$/, '').replace(/\(.*\)$/, '');
}

function camelSegments(name: string): string[] {
  return name
    .split(/[-_]/)
    .flatMap((part) => part.split(/(?=[A-Z])/))
    .map((part) => part.toLowerCase())
    .filter((part) => part.length > 0);
}

/** 0 exact, 1 prefix, 2 camel segment, 99 no match. */
function matchRank(
  item: PlaceholderSuggestion,
  needle: string,
  kind: 'dollar' | 'mustache',
): number {
  if (!needle)
    return 0;
  const name = identifierOf(item, kind).toLowerCase();
  if (name === needle)
    return 0;
  if (name.startsWith(needle))
    return 1;
  if (camelSegments(identifierOf(item, kind)).some((part) => part.startsWith(needle)))
    return 2;
  return 99;
}

function isTokenChar(char: string): boolean {
  return /[A-Za-z0-9_.-]/.test(char);
}

export interface PlaceholderSegment {
  readonly text: string;
  readonly kind: 'text' | 'dollar' | 'mustache' | 'path';
  readonly hint: string;
  readonly clickable?: boolean;
  readonly originKind?: 'folder' | 'environment' | 'path' | 'data';
  readonly sourceId?: string;
  readonly sourceName?: string;
  readonly originName?: string;
}

export interface SplitPlaceholderOptions {
  readonly pathParams?: boolean;
  readonly origins?: readonly PlaceholderOrigin[];
  /** Paint `{{name}}` tokens that are not in `variables` as unknown. */
  readonly markUnknown?: boolean;
}

const SEGMENT_RE = /\{\{\s*[A-Za-z0-9_.-]+\s*\}\}|\$[A-Za-z][A-Za-z0-9]*(?:\([^)]*\))?/g;
const PATH_PARAM_RE = /:([A-Za-z_][A-Za-z0-9_]*)/g;

function catalogName(token: string): string {
  return token.replace(/^\$/, '').replace(/\(.*\)$/, '').toLowerCase();
}

function hintForDollar(token: string): string | null {
  const name = catalogName(token);
  const item = PLACEHOLDER_CATALOG.find((entry) => catalogName(entry.insert) === name);
  return item?.detail ?? null;
}

function mustacheName(token: string): string {
  return token.replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '');
}

function hintForMustache(
  token: string,
  variables: ReadonlySet<string>,
  origins: readonly PlaceholderOrigin[],
  markUnknown: boolean,
): string | null {
  const name = mustacheName(token);
  if (!name)
    return null;
  const origin = originForName(origins, name);
  if (origin)
    return hintForVariableOrigin(origin);
  if (variables.has(name) || variables.has(name.toLowerCase()))
    return 'Folder or environment variable';
  for (const item of variables) {
    if (item.toLowerCase() === name.toLowerCase())
      return 'Folder or environment variable';
  }
  return markUnknown ? 'Unknown variable' : null;
}

function mustacheOriginFields(
  token: string,
  origins: readonly PlaceholderOrigin[],
): Pick<PlaceholderSegment, 'clickable' | 'originKind' | 'sourceId' | 'sourceName' | 'originName'> {
  const origin = originForName(origins, mustacheName(token));
  if (!origin)
    return {};
  return {
    clickable: true,
    originKind: origin.kind,
    sourceId: origin.sourceId,
    sourceName: origin.sourceName,
    originName: origin.name,
  };
}

function pushText(parts: PlaceholderSegment[], text: string): void {
  if (!text)
    return;
  const last = parts[parts.length - 1];
  if (last?.kind === 'text') {
    parts[parts.length - 1] = { ...last, text: `${last.text}${text}` };
    return;
  }
  parts.push({ text, kind: 'text', hint: '' });
}

/** Splits a field value into plain text and known `$token` / `{{var}}` / `:path` runs. */
export function splitPlaceholderSegments(
  value: string,
  variables: readonly string[] = [],
  options: SplitPlaceholderOptions = {},
): PlaceholderSegment[] {
  if (!value)
    return [];
  const names = new Set(uniqueNames(variables));
  const hits = collectPlaceholderHits(
    value,
    names,
    options.pathParams === true,
    options.origins ?? [],
    options.markUnknown === true,
  );
  const parts: PlaceholderSegment[] = [];
  let last = 0;
  for (const hit of hits) {
    if (hit.start > last)
      pushText(parts, value.slice(last, hit.start));
    parts.push({
      text: hit.text,
      kind: hit.kind,
      hint: hit.hint,
      ...(hit.clickable
        ? {
            clickable: true,
            originKind: hit.originKind,
            sourceId: hit.sourceId,
            sourceName: hit.sourceName,
            originName: hit.originName,
          }
        : {}),
    });
    last = hit.end;
  }
  if (last < value.length)
    pushText(parts, value.slice(last));
  return parts;
}

/**
 * Returns the non-text placeholder segment that covers a caret offset, if any.
 */
export function segmentAtOffset(
  value: string,
  offset: number,
  variables: readonly string[] = [],
  options: SplitPlaceholderOptions = {},
): PlaceholderSegment | null {
  const parts = splitPlaceholderSegments(value, variables, options);
  const index = Math.max(0, Math.min(offset, value.length));
  let cursor = 0;
  for (const part of parts) {
    const next = cursor + part.text.length;
    if (part.kind !== 'text' && index >= cursor && index <= next)
      return part;
    cursor = next;
  }
  return null;
}

export function hasPlaceholderTokens(
  value: string,
  variables: readonly string[] = [],
  options: SplitPlaceholderOptions = {},
): boolean {
  return splitPlaceholderSegments(value, variables, options).some((part) => part.kind !== 'text');
}

interface PlaceholderHit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly kind: 'dollar' | 'mustache' | 'path';
  readonly hint: string;
  readonly clickable?: boolean;
  readonly originKind?: 'folder' | 'environment' | 'path' | 'data';
  readonly sourceId?: string;
  readonly sourceName?: string;
  readonly originName?: string;
}

function collectPlaceholderHits(
  value: string,
  variables: ReadonlySet<string>,
  pathParams: boolean,
  origins: readonly PlaceholderOrigin[],
  markUnknown = false,
): PlaceholderHit[] {
  const hits: PlaceholderHit[] = [];
  const pattern = new RegExp(SEGMENT_RE.source, 'g');
  let match = pattern.exec(value);
  while (match) {
    const text = match[0] ?? '';
    const start = match.index;
    const hint = text.startsWith('{{')
      ? hintForMustache(text, variables, origins, markUnknown)
      : hintForDollar(text);
    if (hint)
      hits.push({
        start,
        end: start + text.length,
        text,
        kind: text.startsWith('{{') ? 'mustache' : 'dollar',
        hint,
        ...(text.startsWith('{{') ? mustacheOriginFields(text, origins) : {}),
      });
    match = pattern.exec(value);
  }
  if (!pathParams)
    return hits.sort((left, right) => left.start - right.start);
  const path = value.split('?')[0] ?? value;
  PATH_PARAM_RE.lastIndex = 0;
  let pathMatch = PATH_PARAM_RE.exec(path);
  while (pathMatch) {
    const text = pathMatch[0] ?? '';
    const start = pathMatch.index;
    const end = start + text.length;
    if (!hits.some((hit) => start < hit.end && end > hit.start)) {
      hits.push({
        start,
        end,
        text,
        kind: 'path',
        hint: 'Path param',
        clickable: true,
        originKind: 'path',
        sourceName: 'Params',
        originName: text.slice(1),
      });
    }
    pathMatch = PATH_PARAM_RE.exec(path);
  }
  return hits.sort((left, right) => left.start - right.start);
}
