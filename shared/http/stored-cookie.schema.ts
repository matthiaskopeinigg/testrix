import { z } from 'zod';

export const storedCookieSchema = z.object({
  key: z.string(),
  value: z.string(),
  domain: z.string(),
  path: z.string(),
  expires: z.string().optional(),
  httpOnly: z.boolean().optional(),
  secure: z.boolean().optional(),
  sameSite: z.string().optional(),
});

export type StoredCookie = z.infer<typeof storedCookieSchema>;

export const storedCookieListSchema = z.array(storedCookieSchema);

export type StoredCookieList = z.infer<typeof storedCookieListSchema>;
