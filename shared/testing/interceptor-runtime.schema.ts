import { z } from 'zod';

import { interceptorRuleSchema } from './interceptor.schema';

export const interceptorStartOptionsSchema = z.object({
  startUrl: z.string().max(4_096).default('about:blank'),
});

export type InterceptorStartOptions = z.infer<typeof interceptorStartOptionsSchema>;

export const interceptorRuntimeStatusSchema = z.object({
  running: z.boolean(),
  error: z.string().optional(),
});

export type InterceptorRuntimeStatus = z.infer<typeof interceptorRuntimeStatusSchema>;

export const interceptorHitSchema = z.object({
  at: z.string(),
  ruleId: z.string(),
  ruleName: z.string(),
  action: interceptorRuleSchema.shape.action,
  method: z.string(),
  url: z.string(),
});

export type InterceptorHit = z.infer<typeof interceptorHitSchema>;
