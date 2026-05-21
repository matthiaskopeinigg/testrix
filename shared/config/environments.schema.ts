import { z } from 'zod';

const metaEnvironmentsSchema = z.object({
  createdAt: z.string(),
  updatedAt: z.string(),
});

const environmentNodeBaseSchema = z.object({
  id: z.string().min(1),
  order: z.number().optional(),
});

export const environmentScopeVariableSchema = environmentNodeBaseSchema.extend({
  kind: z.literal('variable'),
  key: z.string().min(1),
  value: z.string(),
  description: z.string().optional(),
});

export type EnvironmentScopeVariable = z.infer<typeof environmentScopeVariableSchema>;

export type EnvironmentScopeFolder = {
  readonly id: string;
  readonly order?: number;
  readonly kind: 'folder';
  readonly label: string;
  readonly description?: string;
  readonly children: EnvironmentScopeNode[];
};

export type EnvironmentScopeNode = EnvironmentScopeFolder | EnvironmentScopeVariable;

export const environmentScopeNodeSchema: z.ZodType<EnvironmentScopeNode> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    environmentNodeBaseSchema.extend({
      kind: z.literal('folder'),
      label: z.string().min(1),
      description: z.string().optional(),
      children: z.array(environmentScopeNodeSchema),
    }),
    environmentScopeVariableSchema,
  ]),
);

/** @deprecated Use {@link environmentScopeFolderSchema} via {@link environmentScopeNodeSchema}. */
export const environmentScopeFolderSchema = environmentScopeNodeSchema;

export const environmentDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  order: z.number().optional(),
  nodes: z.array(environmentScopeNodeSchema),
});

export type EnvironmentDefinition = z.infer<typeof environmentDefinitionSchema>;

/** @deprecated Legacy flat environment row; migrated to environment definitions. */
export const environmentItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  order: z.number().optional(),
});

export type EnvironmentItem = z.infer<typeof environmentItemSchema>;

/** @deprecated Use {@link EnvironmentScopeVariable}. */
export type EnvironmentVariableNode = EnvironmentScopeVariable;

/** @deprecated Use {@link EnvironmentScopeFolder}. */
export type EnvironmentFolderNode = EnvironmentScopeFolder;

/** @deprecated Use {@link EnvironmentScopeNode}. */
export type EnvironmentNode = EnvironmentScopeNode;

/** @deprecated Use {@link environmentScopeNodeSchema}. */
export const environmentNodeSchema = environmentScopeNodeSchema;

/** @deprecated Use {@link environmentScopeVariableSchema}. */
export const environmentVariableNodeSchema = environmentScopeVariableSchema;

/** @deprecated Use {@link environmentScopeFolderSchema}. */
export const environmentFolderNodeSchema = environmentScopeNodeSchema;

export const environmentsFileSchema = z.object({
  schemaVersion: z.literal(1),
  meta: metaEnvironmentsSchema,
  environments: z.array(environmentDefinitionSchema),
});

export type EnvironmentsFile = z.infer<typeof environmentsFileSchema>;

export const environmentsPatchSchema = z
  .object({
    environments: z.array(environmentDefinitionSchema).optional(),
  })
  .strict();

export type EnvironmentsPatch = z.infer<typeof environmentsPatchSchema>;
