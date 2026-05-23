import {
  createDefaultMockResponse,
  createDefaultMockRuleMatcher,
  mockServerFileSchema,
  mockServerFileV1Schema,
  type MockServerEndpoint,
  type MockServerFile,
  type MockServerTreeItem,
} from './mock-server.schema';

/**
 * Migrates a mock server workspace file from v1 flat endpoints to v2 tree.
 */
export function migrateMockServerFile(raw: unknown): MockServerFile {
  const v2 = mockServerFileSchema.safeParse(raw);
  if (v2.success) {
    return v2.data;
  }

  const v1 = mockServerFileV1Schema.safeParse(raw);
  if (!v1.success) {
    return mockServerFileSchema.parse({ schemaVersion: 2, items: [] });
  }

  const items: MockServerTreeItem[] = v1.data.endpoints.map((legacy) => {
    const ts = legacy.updatedAt || new Date().toISOString();
    const matcherId = `${legacy.id}-matcher`;
    const endpoint: MockServerEndpoint = {
      id: legacy.id,
      name: legacy.name,
      description: '',
      tags: [],
      enabled: true,
      priority: 0,
      matchers: [
        {
          ...createDefaultMockRuleMatcher(matcherId),
          methods: [legacy.method],
          path: { mode: 'exact', value: legacy.path, ignoreQuery: false },
        },
      ],
      response: {
        ...createDefaultMockResponse(),
        statusCode: legacy.statusCode,
        body:
          legacy.body.trim().length > 0
            ? { mode: 'json', raw: legacy.body }
            : { mode: 'none' },
        latencyMs: legacy.latencyMs,
      },
      updatedAt: ts,
    };
    return endpoint;
  });

  const port =
    typeof v1.data.options.port === 'number' ? v1.data.options.port : ('auto' as const);

  return mockServerFileSchema.parse({
    schemaVersion: 2,
    options: {
      port,
      host: v1.data.options.host ?? '127.0.0.1',
      delayMs: 0,
      cors: {},
      captureToHistory: false,
      captureMismatchesToHistory: false,
      autoStartOnLaunch: false,
    },
    items,
  });
}
