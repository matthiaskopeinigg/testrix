import { z } from 'zod';

/** Main → renderer: prompt the user for manual input during a flow run. */
export const flowManualInputPromptSchema = z.object({
  requestId: z.string().min(1),
  flowId: z.string().min(1),
  stepId: z.string().min(1),
  stepName: z.string(),
  prompt: z.string(),
  variableName: z.string().min(1),
});

export type FlowManualInputPrompt = z.infer<typeof flowManualInputPromptSchema>;

/** Renderer → main: submit or cancel a pending manual input prompt. */
export const flowManualInputSubmitPayloadSchema = z.object({
  requestId: z.string().min(1),
  value: z.string().optional(),
  cancelled: z.boolean().optional(),
});

export type FlowManualInputSubmitPayload = z.infer<typeof flowManualInputSubmitPayloadSchema>;

/** Resolved manual input from the coordinator. */
export const flowManualInputResultSchema = z.object({
  ok: z.boolean(),
  value: z.string().optional(),
  cancelled: z.boolean().optional(),
  error: z.string().optional(),
});

export type FlowManualInputResult = z.infer<typeof flowManualInputResultSchema>;

/** Request passed from the flow executor to the manual-input coordinator. */
export interface FlowManualInputRequest {
  readonly flowId: string;
  readonly stepId: string;
  readonly stepName: string;
  readonly prompt: string;
  readonly variableName: string;
  readonly timeoutMs?: number;
}
