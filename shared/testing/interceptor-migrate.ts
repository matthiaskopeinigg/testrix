import {
  collectionRequestBodySchema,
  createDefaultCollectionRequestBody,
  type CollectionRequestBody,
} from '../config/collection-request-settings.schema';

import {
  interceptorFileSchema,
  interceptorRuleSchema,
  type InterceptorFile,
  type InterceptorRule,
  type InterceptorTreeItem,
} from './interceptor.schema';

type LegacyMockBodyType = 'json' | 'xml' | 'text';

type LegacyInterceptorRule = Omit<InterceptorRule, 'mockBody'> & {
  readonly mockBodyType?: LegacyMockBodyType;
  readonly mockBody?: string | CollectionRequestBody;
};

function isCollectionRequestBody(value: unknown): value is CollectionRequestBody {
  return collectionRequestBodySchema.safeParse(value).success;
}

/**
 * Converts legacy `mockBodyType` + string `mockBody` to collection-style body.
 */
export function migrateLegacyInterceptorMockBody(
  rule: LegacyInterceptorRule,
): CollectionRequestBody {
  const body = rule.mockBody;
  if (isCollectionRequestBody(body)) {
    return body;
  }
  if (typeof body === 'string' && body.trim().length > 0) {
    const mode =
      rule.mockBodyType === 'json' ? 'json' : rule.mockBodyType === 'xml' ? 'xml' : 'text';
    return { mode, raw: body };
  }
  return createDefaultCollectionRequestBody();
}

function migrateRule(rule: LegacyInterceptorRule): InterceptorRule {
  const { mockBodyType: _legacyType, mockBody: _legacyBody, ...rest } = rule;
  return interceptorRuleSchema.parse({
    ...rest,
    mockBody: migrateLegacyInterceptorMockBody(rule),
  });
}

function migrateItems(items: readonly unknown[]): InterceptorTreeItem[] {
  const out: InterceptorTreeItem[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const record = item as Record<string, unknown>;
    if ('matchUrl' in record) {
      out.push(migrateRule(record as LegacyInterceptorRule));
    } else if ('children' in record) {
      const rawChildren = record['children'];
      const children = Array.isArray(rawChildren) ? migrateItems(rawChildren) : [];
      out.push({
        id: String(record['id'] ?? ''),
        name: String(record['name'] ?? 'Folder'),
        children,
        updatedAt: String(record['updatedAt'] ?? new Date().toISOString()),
      });
    }
  }
  return out;
}

/**
 * Migrates an interceptor workspace file to the current rule body shape.
 */
export function migrateInterceptorFile(raw: unknown): InterceptorFile {
  if (!raw || typeof raw !== 'object') {
    return interceptorFileSchema.parse({ schemaVersion: 1 });
  }

  const record = raw as Record<string, unknown>;
  const rawItems = record['items'];
  const items = Array.isArray(rawItems) ? migrateItems(rawItems) : [];

  return interceptorFileSchema.parse({
    schemaVersion: 1,
    running: record['running'] === true,
    startUrl: typeof record['startUrl'] === 'string' ? record['startUrl'] : undefined,
    items,
  });
}
