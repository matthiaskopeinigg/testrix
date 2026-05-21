import { z } from 'zod';

const boundedText = (max: number) => z.string().max(max);

export const mockEndpointSchema = z.object({
  id: z.string().min(1),
  name: boundedText(256),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']).default('GET'),
  path: boundedText(2_048).default('/'),
  statusCode: z.number().int().min(100).max(599).default(200),
  body: boundedText(512_000).default(''),
  latencyMs: z.number().int().min(0).default(0),
  updatedAt: z.string(),
});

export const mockServerOptionsSchema = z.object({
  port: z.number().int().min(1).max(65_535).default(9_876),
  host: boundedText(256).default('127.0.0.1'),
});

export const mockServerFileSchema = z.object({
  schemaVersion: z.literal(1),
  options: mockServerOptionsSchema,
  endpoints: z.array(mockEndpointSchema).default([]),
});

export type MockServerFile = z.infer<typeof mockServerFileSchema>;
export type MockEndpoint = z.infer<typeof mockEndpointSchema>;

/**
 * Returns an empty mock server workspace file.
 */
export function createDefaultMockServerFile(): MockServerFile {
  return mockServerFileSchema.parse({ schemaVersion: 1, options: {} });
}
