import { z } from 'zod';

/** Stable workspace tab resource ids for development tools. */
export const DEVELOPMENT_TOOL_IDS = [
  'uuid-generator',
  'code-editor',
  'base64',
  'jwt',
  'cron',
  'regex',
  'url',
  'bcrypt',
  'openapi',
] as const;

export const developmentToolIdSchema = z.enum(DEVELOPMENT_TOOL_IDS);

export type DevelopmentToolId = z.infer<typeof developmentToolIdSchema>;
