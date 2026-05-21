import { z } from 'zod';

const boundedText = (max: number) => z.string().max(max);

export const interceptorRuleSchema = z.object({
  id: z.string().min(1),
  name: boundedText(256),
  enabled: z.boolean().default(true),
  matchUrl: boundedText(4_096).default('*'),
  action: z.enum(['proxy', 'mock', 'block']).default('proxy'),
  mockStatus: z.number().int().min(100).max(599).optional(),
  mockBody: boundedText(512_000).optional(),
  updatedAt: z.string(),
});

export const interceptorFolderSchema: z.ZodType<InterceptorFolder> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    name: boundedText(256),
    children: z.array(interceptorTreeItemSchema).default([]),
    updatedAt: z.string(),
  }),
);

export type InterceptorFolder = {
  readonly id: string;
  readonly name: string;
  readonly children: readonly InterceptorTreeItem[];
  readonly updatedAt: string;
};

export const interceptorTreeItemSchema = z.union([interceptorFolderSchema, interceptorRuleSchema]);

export type InterceptorTreeItem = InterceptorFolder | z.infer<typeof interceptorRuleSchema>;
export type InterceptorRule = z.infer<typeof interceptorRuleSchema>;

export const interceptorFileSchema = z.object({
  schemaVersion: z.literal(1),
  running: z.boolean().default(false),
  items: z.array(interceptorTreeItemSchema).default([]),
});

export type InterceptorFile = z.infer<typeof interceptorFileSchema>;

/**
 * Returns an empty interceptor workspace file.
 */
export function createDefaultInterceptorFile(): InterceptorFile {
  return interceptorFileSchema.parse({ schemaVersion: 1 });
}
