import type { CollectionRequestSettings } from '../../config/collection-request-settings.schema';
import type { CollectionNode, CollectionsFile } from '../../config/collections.schema';
import {
  createDefaultCollectionFolderSettings,
  enrichCollectionFolderSettings,
} from '../../config/collection-folder-settings.schema';
import {
  createDefaultCollectionRequestSettings,
  enrichCollectionRequestSettings,
} from '../../config/collection-request-settings.schema';
import type { EnvironmentDefinition, EnvironmentsFile } from '../../config/environments.schema';
import type { HttpMethodId } from '../../config/http-settings.schema';
import { createHttpKeyValueRow } from '../../config/http-settings.schema';
import { importMetaNow, newImportId } from '../import-ids';

type PostmanRecord = Record<string, unknown>;

function parseJsonOrThrow(raw: string): PostmanRecord {
  try {
    return JSON.parse(raw) as PostmanRecord;
  } catch {
    throw new Error('Failed to parse Postman JSON.');
  }
}

function parsePostmanMethod(method: unknown): HttpMethodId {
  const m = String(method ?? 'GET').toUpperCase();
  const allowed: HttpMethodId[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  return allowed.includes(m as HttpMethodId) ? (m as HttpMethodId) : 'GET';
}

function parsePostmanUrl(url: unknown): string {
  if (typeof url === 'string') {
    return url;
  }
  if (url && typeof url === 'object') {
    return String((url as { raw?: string }).raw ?? '');
  }
  return '';
}

function parsePostmanScripts(events: unknown): { preRequest: string; postRequest: string } {
  const scripts = { preRequest: '', postRequest: '' };
  if (!Array.isArray(events)) {
    return scripts;
  }
  for (const event of events) {
    if (!event || typeof event !== 'object') {
      continue;
    }
    const e = event as { listen?: string; script?: { exec?: unknown } };
    const exec = Array.isArray(e.script?.exec) ? e.script.exec.join('\n') : '';
    if (e.listen === 'prerequest') {
      scripts.preRequest = exec;
    } else if (e.listen === 'test') {
      scripts.postRequest = exec;
    }
  }
  return scripts;
}

function parsePostmanHeaders(headers: unknown): ReturnType<typeof createHttpKeyValueRow>[] {
  if (!Array.isArray(headers)) {
    return [];
  }
  return headers
    .filter((h) => h && typeof h === 'object' && String((h as { key?: string }).key ?? '').trim())
    .map((h) => {
      const row = h as { key?: string; value?: string; description?: string; disabled?: boolean };
      return createHttpKeyValueRow({
        key: String(row.key ?? ''),
        value: String(row.value ?? ''),
        description: row.description,
        enabled: row.disabled !== true,
      });
    });
}

function parsePostmanQueryParams(url: unknown): ReturnType<typeof createHttpKeyValueRow>[] {
  if (!url || typeof url !== 'object') {
    return [];
  }
  const query = (url as { query?: unknown }).query;
  if (!Array.isArray(query)) {
    return [];
  }
  return query
    .filter((q) => q && typeof q === 'object' && String((q as { key?: string }).key ?? '').trim())
    .map((q) => {
      const row = q as { key?: string; value?: string; description?: string; disabled?: boolean };
      return createHttpKeyValueRow({
        key: String(row.key ?? ''),
        value: String(row.value ?? ''),
        description: row.description,
        enabled: row.disabled !== true,
      });
    });
}

function parsePostmanBody(body: unknown): CollectionRequestSettings['body'] {
  const defaults = createDefaultCollectionRequestSettings();
  if (!body || typeof body !== 'object') {
    return defaults.body;
  }
  const b = body as Record<string, unknown>;
  const mode = b['mode'];
  if (mode === 'raw') {
    const raw = String(b['raw'] ?? '');
    const lang = String(
      (b['options'] as { raw?: { language?: string } } | undefined)?.raw?.language ?? '',
    ).toLowerCase();
    if (lang === 'json') {
      return { mode: 'json', raw };
    }
    if (lang === 'xml') {
      return { mode: 'xml', raw };
    }
    if (lang === 'html') {
      return { mode: 'html', raw };
    }
    return { mode: 'text', raw };
  }
  if (mode === 'urlencoded') {
    const rows = Array.isArray(b['urlencoded']) ? b['urlencoded'] : [];
    return {
      mode: 'x-www-form-urlencoded',
      fields: rows
        .filter((p) => p && typeof p === 'object' && String((p as { key?: string }).key ?? '').trim())
        .map((p) => {
          const row = p as { key?: string; value?: string; disabled?: boolean };
          return {
            id: newImportId(),
            key: String(row.key ?? ''),
            enabled: row.disabled !== true,
            type: 'text' as const,
            value: String(row.value ?? ''),
          };
        }),
    };
  }
  if (mode === 'formdata') {
    const rows = Array.isArray(b['formdata']) ? b['formdata'] : [];
    return {
      mode: 'form-data',
      fields: rows
        .filter((p) => p && typeof p === 'object' && String((p as { key?: string }).key ?? '').trim())
        .map((p) => {
          const row = p as { key?: string; value?: string; type?: string; src?: string; disabled?: boolean };
          const isFile = row.type === 'file';
          return {
            id: newImportId(),
            key: String(row.key ?? ''),
            enabled: row.disabled !== true,
            type: isFile ? ('file' as const) : ('text' as const),
            value: isFile ? undefined : String(row.value ?? ''),
            filePath: isFile && typeof row.src === 'string' ? row.src : null,
          };
        }),
    };
  }
  return defaults.body;
}

function convertPostmanAuthToHeaders(auth: unknown): ReturnType<typeof createHttpKeyValueRow>[] {
  if (!auth || typeof auth !== 'object') {
    return [];
  }
  const a = auth as { type?: string; bearer?: unknown; basic?: unknown; apikey?: unknown };
  const findParam = (params: unknown, key: string): string => {
    if (!Array.isArray(params)) {
      return '';
    }
    const param = params.find((p) => p && typeof p === 'object' && (p as { key?: string }).key === key);
    return param ? String((param as { value?: string }).value ?? '') : '';
  };

  if (a.type === 'bearer') {
    const token = findParam(a.bearer, 'token');
    if (token) {
      return [createHttpKeyValueRow({ key: 'Authorization', value: `Bearer ${token}` })];
    }
  } else if (a.type === 'basic') {
    const username = findParam(a.basic, 'username');
    const password = findParam(a.basic, 'password');
    const creds =
      typeof btoa === 'function'
        ? btoa(`${username}:${password}`)
        : `${username}:${password}`;
    return [createHttpKeyValueRow({ key: 'Authorization', value: `Basic ${creds}` })];
  } else if (a.type === 'apikey') {
    const key = findParam(a.apikey, 'key');
    const value = findParam(a.apikey, 'value');
    const inWhere = findParam(a.apikey, 'in');
    if (key && value && inWhere === 'header') {
      return [createHttpKeyValueRow({ key, value })];
    }
  }
  return [];
}

function processPostmanItems(items: unknown[], orderStart = 0): CollectionNode[] {
  const nodes: CollectionNode[] = [];
  let order = orderStart;
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const it = item as PostmanRecord;
    if (Array.isArray(it['item'])) {
      const folderSettings = enrichCollectionFolderSettings(createDefaultCollectionFolderSettings());
      const scripts = parsePostmanScripts(it['event']);
      folderSettings.scripts.pre = scripts.preRequest;
      folderSettings.scripts.post = scripts.postRequest;
      const folder: CollectionNode = {
        id: newImportId(),
        kind: 'folder',
        label: String(it['name'] ?? 'Folder'),
        order: order++,
        children: processPostmanItems(it['item'] as unknown[], 0),
        settings: folderSettings,
      };
      nodes.push(folder);
    } else if (it['request']) {
      const req = it['request'] as PostmanRecord;
      const settings = enrichCollectionRequestSettings(createDefaultCollectionRequestSettings());
      const headerRows = [
        ...parsePostmanHeaders(req['header']),
        ...convertPostmanAuthToHeaders(req['auth']),
      ];
      settings.headers.rows = headerRows;
      settings.queryParams = parsePostmanQueryParams(req['url']);
      settings.body = parsePostmanBody(req['body']);
      const scripts = parsePostmanScripts(it['event']);
      settings.scripts.pre = scripts.preRequest;
      settings.scripts.post = scripts.postRequest;
      const request: CollectionNode = {
        id: newImportId(),
        kind: 'request',
        label: String(it['name'] ?? 'Request'),
        order: order++,
        method: parsePostmanMethod(req['method']),
        url: parsePostmanUrl(req['url']),
        settings,
      };
      nodes.push(request);
    }
  }
  return nodes;
}

/** Converts a Postman Collection v2 export into a Testrix collections file. */
export function importPostmanCollection(raw: string): CollectionsFile {
  const json = parseJsonOrThrow(raw);
  const info = (json['info'] as { name?: string } | undefined) ?? {};
  const title = String(info.name ?? 'Imported Postman Collection');
  const nodes = Array.isArray(json['item']) ? processPostmanItems(json['item'] as unknown[]) : [];
  if (nodes.length === 0 && title) {
    nodes.push({
      id: newImportId(),
      kind: 'folder',
      label: title,
      order: 0,
      children: [],
      settings: enrichCollectionFolderSettings(createDefaultCollectionFolderSettings()),
    });
  }
  return {
    schemaVersion: 1,
    meta: importMetaNow(),
    nodes,
  };
}

/** Converts a Postman Environment or Globals export into a Testrix environments file. */
export function importPostmanEnvironment(raw: string): EnvironmentsFile {
  const json = parseJsonOrThrow(raw);
  const valuesRaw = Array.isArray(json['values']) ? json['values'] : [];
  const titleRaw = typeof json['name'] === 'string' ? json['name'].trim() : '';
  const scope = json['_postman_variable_scope'];
  const title = titleRaw || (scope === 'globals' ? 'Globals' : 'Imported environment');
  const now = importMetaNow().updatedAt;
  const variables = valuesRaw
    .filter((v) => v && typeof v === 'object' && (v as { enabled?: boolean }).enabled !== false)
    .map((v, index) => {
      const row = v as { key?: unknown; value?: unknown; description?: unknown };
      return {
        id: newImportId(),
        kind: 'variable' as const,
        key: String(row.key ?? ''),
        value: String(row.value ?? ''),
        description: row.description != null ? String(row.description) : undefined,
        order: index,
      };
    })
    .filter((v) => v.key.trim().length > 0);

  const env: EnvironmentDefinition = {
    id: typeof json['id'] === 'string' && json['id'].trim() ? String(json['id']).trim() : newImportId(),
    name: title,
    order: 0,
    nodes: variables,
  };

  return {
    schemaVersion: 1,
    meta: importMetaNow(),
    environments: [env],
  };
}
