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

export const JWT_ALGORITHMS = [
  'HS256',
  'HS384',
  'HS512',
  'RS256',
  'RS384',
  'RS512',
  'ES256',
  'ES384',
  'ES512',
] as const;

export type JwtAlgorithm = (typeof JWT_ALGORITHMS)[number];

export const JWT_SECRET_SOURCES = ['inline', 'file', 'envVar'] as const;
export type JwtSecretSource = (typeof JWT_SECRET_SOURCES)[number];

export const JWT_TOOL_MODES = ['decode', 'generate', 'validate'] as const;
export type JwtToolMode = (typeof JWT_TOOL_MODES)[number];

export const jwtSigningProfileSchema = z.object({
  id: z.string().min(1),
  name: boundedText(128).default('Default'),
  environmentId: z.string().optional(),
  alg: z.enum(JWT_ALGORITHMS).default('HS256'),
  secretSource: z.enum(JWT_SECRET_SOURCES).default('inline'),
  secretFilePath: boundedText(1_024).default(''),
  secretFileName: boundedText(256).default(''),
  secretEnvVarKey: boundedText(256).default(''),
  iss: boundedText(512).default(''),
  aud: boundedText(1_024).default(''),
  sub: boundedText(512).default(''),
  ttlSec: z.number().int().min(0).max(31_536_000).default(3_600),
  includeJti: z.boolean().default(true),
  includeIat: z.boolean().default(true),
  nbfOffsetSec: z.number().int().min(0).max(86_400).default(0),
  kid: boundedText(256).default(''),
  typ: boundedText(64).default('JWT'),
  extraClaimsJson: boundedText(32_000).default('{}'),
  clockToleranceSec: z.number().int().min(0).max(3_600).default(0),
  requiredClaims: z.array(boundedText(64)).max(32).default([]),
  expectIss: boundedText(512).default(''),
  expectAud: boundedText(1_024).default(''),
});

export type JwtSigningProfile = z.infer<typeof jwtSigningProfileSchema>;

/** Returns a default signing profile for new JWT Toolkit sessions. */
export function createDefaultJwtSigningProfile(
  id = 'default',
  name = 'Default',
): JwtSigningProfile {
  return jwtSigningProfileSchema.parse({ id, name });
}

function migrateJwtToolMode(mode: unknown): unknown {
  if (mode === 'encode') {
    return 'generate';
  }
  if (mode === 'verify') {
    return 'validate';
  }
  return mode;
}

export const jwtToolStateSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return raw;
  }
  const input = raw as Record<string, unknown>;
  const next: Record<string, unknown> = {
    ...input,
    mode: migrateJwtToolMode(input['mode']),
  };
  if (!Array.isArray(next['profiles']) || (next['profiles'] as unknown[]).length === 0) {
    const fallback = createDefaultJwtSigningProfile();
    next['profiles'] = [fallback];
    if (!next['activeProfileId']) {
      next['activeProfileId'] = fallback.id;
    }
  }
  if (!next['activeProfileId'] && Array.isArray(next['profiles'])) {
    const first = (next['profiles'] as { id?: string }[])[0];
    next['activeProfileId'] = first?.id ?? 'default';
  }
  return next;
}, z.object({
  mode: z.enum(JWT_TOOL_MODES).default('decode'),
  token: boundedText(16_000).default(''),
  activeProfileId: boundedText(128).default('default'),
  profiles: z.array(jwtSigningProfileSchema).default([]),
  /** When true, copy actions prefix the token with `Bearer `. */
  copyWithBearerPrefix: z.boolean().default(false),
  /** @deprecated Kept for reading older sessions; ignored by the toolkit UI. */
  headerJson: boundedText(8_000).optional(),
  /** @deprecated Kept for reading older sessions; ignored by the toolkit UI. */
  payloadJson: boundedText(32_000).optional(),
}));

export type JwtToolState = z.infer<typeof jwtToolStateSchema>;

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
