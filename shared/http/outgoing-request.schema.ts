import { z } from 'zod';

import { HTTP_METHOD_IDS } from '../config/http-settings.schema';
import {
  httpCertificatesSettingsSchema,
  httpDnsSettingsSchema,
  httpProxySettingsSchema,
  httpRetriesSettingsSchema,
} from '../config/http-settings.schema';
import { encodedRequestBodySchema } from './encoded-body.schema';

export const outgoingHttpRequestSchema = z.object({
  requestId: z.string().min(1),
  method: z.enum(HTTP_METHOD_IDS),
  url: z.string().min(1),
  headers: z.record(z.string(), z.string()),
  body: encodedRequestBodySchema,
  transport: z.object({
    timeoutMs: z.number().int().min(0),
    useCookies: z.boolean(),
    http2Enabled: z.boolean(),
    http2FallbackToHttp1: z.boolean(),
    followRedirects: z.boolean(),
    maxRedirects: z.number().int().min(0),
    strictSsl: z.boolean(),
    disableCookiesGlobally: z.boolean(),
    ignoreInvalidSsl: z.boolean(),
    proxy: httpProxySettingsSchema,
    certificates: httpCertificatesSettingsSchema,
    dns: httpDnsSettingsSchema,
    retries: httpRetriesSettingsSchema,
  }),
  scripts: z.object({
    pre: z.array(z.string()),
    post: z.array(z.string()),
  }),
  environmentId: z.string().nullable(),
  variableContext: z.record(z.string(), z.string()),
});

export type OutgoingHttpRequest = z.infer<typeof outgoingHttpRequestSchema>;

export const sendHttpRequestPayloadSchema = outgoingHttpRequestSchema.extend({
  runScope: z
    .object({
      runId: z.string(),
      folderId: z.string().optional(),
      index: z.number().optional(),
    })
    .optional(),
});

export type SendHttpRequestPayload = z.infer<typeof sendHttpRequestPayloadSchema>;

export const httpResponseHeaderSchema = z.object({
  key: z.string(),
  value: z.string(),
});

export type HttpResponseHeader = z.infer<typeof httpResponseHeaderSchema>;

export const httpResponseRedirectHopSchema = z.object({
  from: z.string(),
  to: z.string(),
  statusCode: z.number().int(),
  timeMs: z.number().int(),
});

export type HttpResponseRedirectHop = z.infer<typeof httpResponseRedirectHopSchema>;

export const httpResponseSnapshotSchema = z.object({
  id: z.string().min(1),
  capturedAt: z.string(),
  label: z.string().optional(),
  requestSummary: z.object({
    method: z.string(),
    url: z.string(),
    environmentId: z.string().nullable().optional(),
    requestId: z.string().optional(),
  }),
  status: z.object({
    code: z.number().int(),
    text: z.string(),
    ok: z.boolean(),
  }),
  timing: z.object({
    totalMs: z.number(),
    dnsMs: z.number().optional(),
    connectMs: z.number().optional(),
    tlsMs: z.number().optional(),
    ttfbMs: z.number().optional(),
    downloadMs: z.number().optional(),
  }),
  size: z.object({
    headersBytes: z.number().int(),
    bodyBytes: z.number().int(),
  }),
  headers: z.array(httpResponseHeaderSchema),
  redirects: z.array(httpResponseRedirectHopSchema).default([]),
  body: z.object({
    encoding: z.enum(['text', 'base64']),
    text: z.string().optional(),
    base64: z.string().optional(),
    contentType: z.string().optional(),
    truncated: z.boolean().optional(),
    storagePath: z.string().optional(),
  }),
  meta: z
    .object({
      attempt: z.number().int().optional(),
      fromRetry: z.boolean().optional(),
      runScope: z
        .object({
          runId: z.string(),
          folderId: z.string().optional(),
          index: z.number().optional(),
        })
        .optional(),
      errorMessage: z.string().optional(),
    })
    .optional(),
});

export type HttpResponseSnapshot = z.infer<typeof httpResponseSnapshotSchema>;

export const outgoingHttpResponseSchema = z.object({
  snapshot: httpResponseSnapshotSchema,
  /** Resolved variable map after pre/post scripts (for session caching in the renderer). */
  variableContext: z.record(z.string(), z.string()).optional(),
  /** Keys changed by pre/post scripts during the request. */
  scriptVariablePatch: z.record(z.string(), z.string()).optional(),
});

export type OutgoingHttpResponse = z.infer<typeof outgoingHttpResponseSchema>;
