import { z } from 'zod';

import { databaseConnectionSchema } from './database';
import { parseFlowScenario, type FlowScenario } from './flow-graph';
import { workspacePackSelectionSchema } from './workspace-pack';

/**
 * Schemas for IPC arguments that have no domain schema of their own. Main parses
 * every invoke through these before it reaches a service.
 */

/** An entity id sent from the renderer (UUIDs today, older slug ids in old files). */
export const ipcIdSchema = z.string().trim().min(1).max(512);

/** Nullable/absent id, for optional trailing arguments. */
export const ipcOptionalIdSchema = z
  .string()
  .max(512)
  .nullish()
  .transform((value) => (value && value.trim() ? value : undefined));

/**
 * A `Partial<File>` patch. The store merges it into the current file and runs the
 * file's own parser, so this only has to guarantee a plain object.
 */
export const ipcFilePatchSchema = z.record(z.string(), z.unknown());

export const flowScenarioPayloadSchema = z.unknown().transform((value, ctx): FlowScenario => {
  const scenario = parseFlowScenario(value);
  if (!scenario) {
    ctx.issues.push({ code: 'custom', message: 'Invalid flow scenario.', input: value });
    return z.NEVER;
  }
  return scenario;
});

export const flowRunDraftSchema = z.object({
  scenario: flowScenarioPayloadSchema,
  e2eShowWindow: z.boolean().optional(),
  deviceShowEmulator: z.boolean().optional(),
});

export const flowPickSelectorSchema = z.object({
  url: z.string().max(8192).nullish(),
  kind: z.string().max(64).nullish(),
  stopBeforeNodeId: z.string().max(512).nullish(),
  scenario: flowScenarioPayloadSchema.nullish(),
});

export const flowPickDeviceSelectorSchema = z.object({
  stopBeforeNodeId: z.string().max(512).nullish(),
  scenario: flowScenarioPayloadSchema.nullish(),
  runPrevious: z.boolean().optional(),
});

export const flowManualPromptReplySchema = z.object({
  requestId: ipcIdSchema,
  ok: z.boolean(),
  value: z.string().max(1_000_000),
});

export const deviceStartEmulatorSchema = z.object({
  coldBoot: z.boolean().optional(),
  openHome: z.boolean().optional(),
});

export const regressionRunOptionsSchema = z.object({
  onlyKeys: z.array(z.string().max(1024)).max(10_000).optional(),
});

const queryPageSchema = z.object({
  limit: z.number().int().min(0).max(1_000_000),
  offset: z.number().int().min(0),
});

export const databaseQueryRequestSchema = z.object({
  connection: databaseConnectionSchema,
  query: z.string(),
  page: queryPageSchema.optional(),
  paramNames: z.array(z.string()).optional(),
  paramValues: z.array(z.unknown()).optional(),
  timeoutMs: z.number().int().positive().optional(),
});

export const databaseSessionQueryRequestSchema = z.object({
  tabId: ipcIdSchema,
  connection: databaseConnectionSchema,
  query: z.string(),
  page: queryPageSchema.optional(),
  timeoutMs: z.number().int().positive().optional(),
  hold: z.boolean().optional(),
});

export const databaseIntrospectLevelSchema = z.enum([
  'schemas',
  'tables',
  'columns',
  'indexes',
  'foreignKeys',
  'ddl',
  'routines',
  'triggers',
  'sequences',
  'users',
]);

export const databaseIntrospectRequestSchema = z.object({
  connection: databaseConnectionSchema,
  level: databaseIntrospectLevelSchema,
  schema: z.string().optional(),
  table: z.string().optional(),
});

export const workspaceImportModeSchema = z.enum(['merge', 'replace', 'new']);

export const workspaceImportApplyRequestSchema = z.object({
  path: z.string().min(1).max(4096),
  mode: workspaceImportModeSchema,
  selection: workspacePackSelectionSchema,
  workspaceName: z.string().max(200).optional(),
});

export const workspaceNameSchema = z.string().max(200).catch('');

export const workspaceOrderSchema = z.array(ipcIdSchema).max(10_000);

/** File name for a dropped import; bytes are checked separately for type and size. */
export const importFileNameSchema = z.string().max(260).catch('import.bin');
