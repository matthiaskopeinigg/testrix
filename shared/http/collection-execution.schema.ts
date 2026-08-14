import { z } from 'zod';

import { collectionNodeSchema } from '../config/collections.schema';
import { httpSettingsSchema } from '../config/http-settings.schema';
import { environmentsFileSchema } from '../config/environments.schema';

export const environmentVariableKeyModeSchema = z.object({
  useFolderPathInKeys: z.boolean(),
});

export type EnvironmentVariableKeyMode = z.infer<typeof environmentVariableKeyModeSchema>;

export const collectionRunScopeSchema = z.object({
  runId: z.string().min(1),
  folderId: z.string().optional(),
  index: z.number().int().min(0).optional(),
  sharedVariables: z.record(z.string(), z.string()).optional(),
});

export type CollectionRunScope = z.infer<typeof collectionRunScopeSchema>;

export const collectionExecutionInputSchema = z.object({
  requestId: z.string().min(1),
  nodes: z.array(collectionNodeSchema),
  http: httpSettingsSchema,
  environments: environmentsFileSchema,
  appVersion: z.string(),
  runScope: collectionRunScopeSchema.optional(),
  environmentVariableKeys: environmentVariableKeyModeSchema.optional(),
});

export type CollectionExecutionInput = z.infer<typeof collectionExecutionInputSchema>;
