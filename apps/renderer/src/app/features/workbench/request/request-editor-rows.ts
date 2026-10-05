import { newEntityId, type CollectionKvRow, type RequestFormRow } from '@testrix/contracts';

import type { MockKeyValue } from './request-mock';

export function lineCount(text: string): number {
  return Math.max(1, text.split('\n').length);
}

export function paneSlideVertical(order: readonly string[], from: string, to: string): 'up' | 'down' {
  return order.indexOf(to) > order.indexOf(from) ? 'down' : 'up';
}

export function countEnabled(rows: readonly MockKeyValue[]): number {
  return rows.filter((row) => row.enabled && row.key.trim()).length;
}

function emptyForm(): RequestFormRow {
  return {
    id: newEntityId(),
    enabled: true,
    key: '',
    value: '',
    description: '',
    kind: 'text',
    fileName: '',
    contentType: '',
  };
}

export function withTrailingForm(rows: readonly RequestFormRow[]): RequestFormRow[] {
  const copy = rows.map((row) => ({ ...row }));
  const last = copy[copy.length - 1];
  if (!last || last.key.trim() || last.value.trim() || last.fileName.trim())
    copy.push(emptyForm());
  return copy;
}

export function persistForm(rows: readonly RequestFormRow[]): RequestFormRow[] {
  return rows.filter((row) => row.key.trim() || row.value.trim() || row.fileName.trim());
}

export function parseQueryKeep(url: string, current: readonly CollectionKvRow[]): CollectionKvRow[] {
  const fromUrl = url.includes('?')
    ? [...new URLSearchParams(url.slice(url.indexOf('?') + 1)).entries()].map(([key, value], index) => {
        const existing = current.find((row) => row.key === key);
        return {
          id: existing?.id ?? `query_${key}_${index}`,
          enabled: existing?.enabled ?? true,
          key,
          value,
          description: existing?.description ?? '',
        };
      })
    : [];
  return fromUrl;
}

export function atobSafe(value: string): string {
  try {
    return globalThis.atob(value);
  } catch {
    return value;
  }
}
