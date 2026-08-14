import type { CollectionsFile } from '../../config/collections.schema';
import {
  createDefaultCollectionRequestSettings,
  enrichCollectionRequestSettings,
} from '../../config/collection-request-settings.schema';
import type { HttpMethodId } from '../../config/http-settings.schema';
import { createHttpKeyValueRow } from '../../config/http-settings.schema';
import { importMetaNow, newImportId } from '../import-ids';

function parseMethod(method: unknown): HttpMethodId {
  const m = String(method ?? 'GET').toUpperCase();
  const allowed: HttpMethodId[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  return allowed.includes(m as HttpMethodId) ? (m as HttpMethodId) : 'GET';
}

/** Converts a HAR log into a Testrix collections file (max 500 entries). */
export function importHar(content: string | object): CollectionsFile {
  const j = typeof content === 'string' ? (JSON.parse(content) as object) : content;
  const log = (j as { log?: { entries?: unknown } })?.log;
  const entries = log?.entries;
  if (!Array.isArray(entries)) {
    throw new Error('Invalid HAR: expected log.entries');
  }

  const nodes: CollectionsFile['nodes'] = [];
  const max = Math.min(entries.length, 500);

  for (let i = 0; i < max; i++) {
    const e = entries[i] as {
      comment?: string;
      request?: {
        method?: string;
        url?: string | { raw?: string };
        headers?: Array<{ name?: string; value?: string }>;
        postData?: { text?: string };
      };
    };
    const req = e?.request;
    if (!req) {
      continue;
    }
    const urlStr =
      typeof req.url === 'string' ? req.url : (req.url && req.url.raw) || '';
    if (!urlStr) {
      continue;
    }

    const settings = enrichCollectionRequestSettings(createDefaultCollectionRequestSettings());
    settings.headers.rows = (Array.isArray(req.headers) ? req.headers : [])
      .filter((h) => h?.name && !String(h.name).startsWith(':'))
      .map((h) =>
        createHttpKeyValueRow({
          key: String(h.name ?? ''),
          value: String(h.value ?? ''),
        }),
      );
    const bodyText = req.postData?.text || '';
    if (bodyText) {
      settings.body = { mode: 'text', raw: bodyText };
    }

    nodes.push({
      id: newImportId(),
      kind: 'request',
      label: e.comment || urlStr.substring(0, 96) || `HAR ${i + 1}`,
      order: nodes.length,
      method: parseMethod(req.method),
      url: urlStr,
      settings,
    });
  }

  if (nodes.length === 0) {
    throw new Error('No usable entries in HAR.');
  }

  return {
    schemaVersion: 1,
    meta: importMetaNow(),
    nodes,
  };
}
