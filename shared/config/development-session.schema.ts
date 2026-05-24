import { z } from 'zod';

import { DEVELOPMENT_TOOL_IDS, type DevelopmentToolId } from './development-tool.schema';


const boundedText = (max: number) => z.string().max(max);

export const uuidGeneratorToolStateSchema = z.object({
  count: z.number().int().min(1).max(500).default(1),
  uppercase: z.boolean().default(false),
  stripHyphens: z.boolean().default(false),
  version: z.enum(['v4']).default('v4'),
  output: boundedText(64_000).default(''),
});

export const codeEditorToolStateSchema = z.object({
  language: z
    .enum(['json', 'xml', 'graphql', 'html', 'plaintext', 'js', 'ts', 'css', 'scss', 'sql', 'redis'])
    .default('json'),
  content: boundedText(512_000).default(''),
});

export const base64ToolStateSchema = z.object({
  mode: z.enum(['encode', 'decode']).default('encode'),
  urlSafe: z.boolean().default(false),
  input: boundedText(256_000).default(''),
});

export const jwtToolStateSchema = z.object({
  mode: z.enum(['decode', 'encode', 'verify']).default('decode'),
  token: boundedText(16_000).default(''),
  headerJson: boundedText(8_000).default('{\n  "alg": "HS256",\n  "typ": "JWT"\n}'),
  payloadJson: boundedText(32_000).default('{\n  "sub": "1234567890",\n  "name": "Testrix User"\n}'),
});

export const cronToolStateSchema = z.object({
  minute: boundedText(64).default('*'),
  hour: boundedText(64).default('*'),
  dayOfMonth: boundedText(64).default('*'),
  month: boundedText(64).default('*'),
  dayOfWeek: boundedText(64).default('*'),
  expression: boundedText(128).default('* * * * *'),
  presetId: boundedText(64).default('custom'),
});

export const regexToolStateSchema = z.object({
  pattern: boundedText(2_000).default(''),
  flags: z
    .object({
      g: z.boolean().default(true),
      i: z.boolean().default(false),
      m: z.boolean().default(false),
      s: z.boolean().default(false),
      u: z.boolean().default(false),
      y: z.boolean().default(false),
    })
    .default({ g: true, i: false, m: false, s: false, u: false, y: false }),
  sample: boundedText(64_000).default('Hello Testrix 42'),
  replacement: boundedText(8_000).default(''),
  cheatsheetId: boundedText(64).default(''),
});

export const urlToolStateSchema = z.object({
  mode: z.enum(['encode', 'decode', 'parse']).default('encode'),
  componentOnly: z.boolean().default(true),
  input: boundedText(64_000).default(''),
});

export const bcryptToolStateSchema = z.object({
  mode: z.enum(['hash', 'verify']).default('hash'),
  rounds: z.number().int().min(4).max(15).default(10),
  hash: boundedText(128).default(''),
});

export const openapiToolStateSchema = z.object({
  section: z.enum(['editor', 'outline', 'validate']).default('editor'),
  format: z.enum(['json', 'yaml']).default('json'),
  content: boundedText(512_000).default(''),
});

export const developmentToolsRecordSchema = z.object({
  'uuid-generator': uuidGeneratorToolStateSchema,
  'code-editor': codeEditorToolStateSchema,
  base64: base64ToolStateSchema,
  jwt: jwtToolStateSchema,
  cron: cronToolStateSchema,
  regex: regexToolStateSchema,
  url: urlToolStateSchema,
  bcrypt: bcryptToolStateSchema,
  openapi: openapiToolStateSchema,
});

export const workspaceDevelopmentSchema = z.object({
  tools: developmentToolsRecordSchema,
});

export type WorkspaceDevelopmentState = z.infer<typeof workspaceDevelopmentSchema>;
export type UuidGeneratorToolState = z.infer<typeof uuidGeneratorToolStateSchema>;
export type CodeEditorToolState = z.infer<typeof codeEditorToolStateSchema>;
export type Base64ToolState = z.infer<typeof base64ToolStateSchema>;
export type JwtToolState = z.infer<typeof jwtToolStateSchema>;
export type CronToolState = z.infer<typeof cronToolStateSchema>;
export type RegexToolState = z.infer<typeof regexToolStateSchema>;
export type UrlToolState = z.infer<typeof urlToolStateSchema>;
export type BcryptToolState = z.infer<typeof bcryptToolStateSchema>;
export type OpenApiToolState = z.infer<typeof openapiToolStateSchema>;

/** Default OpenAPI sample document (JSON). */
export const DEFAULT_OPENAPI_SAMPLE = JSON.stringify(
  {
    openapi: '3.0.3',
    info: { title: 'Sample API', version: '1.0.0' },
    paths: {
      '/health': {
        get: { summary: 'Health check', responses: { '200': { description: 'OK' } } },
      },
    },
  },
  null,
  2,
);

/** Default code editor content. */
export const DEFAULT_CODE_EDITOR_CONTENT = `{
  "hello": "Testrix"
}`;

/**
 * Returns default development workspace session slice.
 */
export function createDefaultWorkspaceDevelopment(): WorkspaceDevelopmentState {
  return workspaceDevelopmentSchema.parse({
    tools: {
      'uuid-generator': {},
      'code-editor': { content: DEFAULT_CODE_EDITOR_CONTENT },
      base64: {},
      jwt: {},
      cron: {},
      regex: {},
      url: {},
      bcrypt: {},
      openapi: { content: DEFAULT_OPENAPI_SAMPLE },
    },
  });
}

export type DevelopmentToolStateMap = WorkspaceDevelopmentState['tools'];

export type DevelopmentToolStateForId<T extends keyof DevelopmentToolStateMap> =
  DevelopmentToolStateMap[T];

/** Partial tool states accepted by session patches. */
export type DevelopmentToolsPatch = {
  [K in DevelopmentToolId]?: Partial<DevelopmentToolStateForId<K>>;
};

/**
 * Merges defaults, current session, and a partial tools patch into a full slice.
 */
export function mergeWorkspaceDevelopment(
  current: WorkspaceDevelopmentState | undefined,
  patch: { tools?: DevelopmentToolsPatch },
  defaults: WorkspaceDevelopmentState = createDefaultWorkspaceDevelopment(),
): WorkspaceDevelopmentState {
  const base = current ?? defaults;
  const rawTools: Record<string, unknown> = {};
  for (const id of DEVELOPMENT_TOOL_IDS) {
    rawTools[id] = {
      ...defaults.tools[id],
      ...base.tools[id],
      ...(patch.tools?.[id] ?? {}),
    };
  }
  return workspaceDevelopmentSchema.parse({ tools: rawTools });
}
