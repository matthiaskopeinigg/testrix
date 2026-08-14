import { z } from 'zod';

export const appKeyboardSettingsSchema = z.object({
  bindings: z.record(z.string(), z.string()).default({}),
});

export type AppKeyboardSettings = z.infer<typeof appKeyboardSettingsSchema>;

export function createDefaultAppKeyboardSettings(): AppKeyboardSettings {
  return { bindings: {} };
}
