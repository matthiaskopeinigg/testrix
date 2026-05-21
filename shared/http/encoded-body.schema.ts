import { z } from 'zod';

export const encodedRequestBodySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({
    kind: z.literal('text'),
    content: z.string(),
    contentType: z.string(),
  }),
  z.object({
    kind: z.literal('urlencoded'),
    content: z.string(),
    contentType: z.literal('application/x-www-form-urlencoded'),
  }),
  z.object({
    kind: z.literal('multipart'),
    parts: z.array(
      z.object({
        name: z.string(),
        value: z.string().optional(),
        filePath: z.string().optional(),
        fileName: z.string().optional(),
      }),
    ),
  }),
  z.object({
    kind: z.literal('binary'),
    filePath: z.string(),
    contentType: z.string().optional(),
  }),
  z.object({
    kind: z.literal('binary-inline'),
    base64: z.string(),
    contentType: z.string().optional(),
  }),
]);

export type EncodedRequestBodySchema = z.infer<typeof encodedRequestBodySchema>;
