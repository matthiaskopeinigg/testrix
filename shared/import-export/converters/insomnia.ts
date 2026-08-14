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

type InsomniaResource = {
  _type?: string;
  name?: string;
  method?: string;
  url?: string;
  headers?: Array<{ name?: string; value?: string; disabled?: boolean }>;
  body?: { mimeType?: string; text?: string };
  parentId?: string | null;
};

/** Converts an Insomnia v4 export into a Testrix collections file. */
export function importInsomniaExport(parsed: object): CollectionsFile {
  const o = parsed as { resources?: InsomniaResource[] };
  const resources = Array.isArray(o.resources) ? o.resources : [];
  const requests = resources.filter((r) => r._type === 'request');
  if (requests.length === 0) {
    throw new Error('No Insomnia requests found in export.');
  }

  const nodes: CollectionsFile['nodes'] = [];
  for (const req of requests) {
    const settings = enrichCollectionRequestSettings(createDefaultCollectionRequestSettings());
    settings.headers.rows = (req.headers ?? [])
      .filter((h) => h?.name && h.disabled !== true)
      .map((h) =>
        createHttpKeyValueRow({
          key: String(h.name ?? ''),
          value: String(h.value ?? ''),
        }),
      );
    const bodyText = req.body?.text ?? '';
    if (bodyText) {
      const mime = (req.body?.mimeType ?? '').toLowerCase();
      if (mime.includes('json')) {
        settings.body = { mode: 'json', raw: bodyText };
      } else if (mime.includes('xml')) {
        settings.body = { mode: 'xml', raw: bodyText };
      } else {
        settings.body = { mode: 'text', raw: bodyText };
      }
    }

    nodes.push({
      id: newImportId(),
      kind: 'request',
      label: String(req.name ?? 'Insomnia Request'),
      order: nodes.length,
      method: parseMethod(req.method),
      url: String(req.url ?? ''),
      settings,
    });
  }

  return {
    schemaVersion: 1,
    meta: importMetaNow(),
    nodes,
  };
}
