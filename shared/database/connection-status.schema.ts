import { z } from 'zod';

export const databaseConnectionStatusStateSchema = z.enum([
  'unknown',
  'checking',
  'connected',
  'error',
]);

export type DatabaseConnectionStatusState = z.infer<typeof databaseConnectionStatusStateSchema>;

export const databaseConnectionStatusSchema = z.object({
  state: databaseConnectionStatusStateSchema,
  message: z.string().optional(),
  checkedAt: z.string().optional(),
});

export type DatabaseConnectionStatus = z.infer<typeof databaseConnectionStatusSchema>;

export const databaseConnectionStatusMapSchema = z.record(
  z.string(),
  databaseConnectionStatusSchema,
);

export type DatabaseConnectionStatusMap = z.infer<typeof databaseConnectionStatusMapSchema>;
