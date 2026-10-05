import { parse as parseYaml } from 'yaml'

import { emptyCollectionKvRow } from './collection-folder'
import { HTTP_METHODS, type HttpMethod } from './collection-tree'
import { detectImportFormat, parseImportDocument } from './import-detect'
import { looksLikeCurl, parseCurl } from './collection-request'
import type { CollectionKvRow } from './collection-folder'

export type UrlPasteIngestKind =
  | 'curl'
  | 'openapi-path'
  | 'json-request'
  | 'openapi-doc'

export interface UrlPasteIngestPreview {
  readonly kind: UrlPasteIngestKind
  readonly label: string
  readonly detail: string
  readonly method?: HttpMethod
  readonly url?: string
  readonly headers?: readonly CollectionKvRow[]
  readonly body?: string
}

const OPENAPI_PATH_RE =
  /^(?<method>GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(?<path>\/\S+)\s*$/i

function normalizeMethod(raw: string): HttpMethod {
  const upper = raw.toUpperCase()
  return (HTTP_METHODS as readonly string[]).includes(upper) ? (upper as HttpMethod) : 'GET'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function parseOpenApiPathLine(text: string): UrlPasteIngestPreview | null {
  const match = text.trim().match(OPENAPI_PATH_RE)
  const groups = match?.groups;
  if (!groups?.['method'] || !groups['path'])
    return null
  const method = normalizeMethod(groups['method'])
  const path = groups['path']
  return {
    kind: 'openapi-path',
    label: 'OpenAPI path',
    detail: `${method} ${path}`,
    method,
    url: path,
  }
}

function parseJsonRequest(text: string): UrlPasteIngestPreview | null {
  let raw: unknown
  try {
    raw = JSON.parse(text.trim())
  } catch {
    return null
  }
  if (!isRecord(raw))
    return null

  const request = isRecord(raw['request']) ? raw['request'] : raw
  const urlRaw = request['url']
  let url = ''
  if (typeof urlRaw === 'string')
    url = urlRaw
  else if (isRecord(urlRaw) && typeof urlRaw['raw'] === 'string')
    url = urlRaw['raw']
  else if (isRecord(urlRaw) && typeof urlRaw['path'] === 'string')
    url = urlRaw['path']

  const methodRaw = request['method'] ?? raw['method']
  const method = typeof methodRaw === 'string' ? normalizeMethod(methodRaw) : 'GET'

  if (!url.trim())
    return null

  const headers: CollectionKvRow[] = []
  const headerSource = request['header'] ?? request['headers']
  if (Array.isArray(headerSource)) {
    for (const item of headerSource) {
      if (!isRecord(item))
        continue
      const key = typeof item['key'] === 'string' ? item['key'] : typeof item['name'] === 'string' ? item['name'] : ''
      const value = typeof item['value'] === 'string' ? item['value'] : ''
      if (!key.trim())
        continue
      headers.push({
        ...emptyCollectionKvRow(),
        id: `ingest_h_${headers.length}`,
        key: key.trim(),
        value,
      })
    }
  }

  let body = ''
  const bodyRaw = request['body']
  if (typeof bodyRaw === 'string')
    body = bodyRaw
  else if (isRecord(bodyRaw) && typeof bodyRaw['raw'] === 'string')
    body = bodyRaw['raw']

  return {
    kind: 'json-request',
    label: 'JSON request',
    detail: `${method} ${url}`,
    method,
    url,
    headers,
    body: body || undefined,
  }
}

function firstOpenApiOperation(doc: Record<string, unknown>): {
  readonly method: HttpMethod
  readonly path: string
  readonly baseUrl: string
} | null {
  const paths =
    doc['paths'] && typeof doc['paths'] === 'object' && !Array.isArray(doc['paths'])
      ? (doc['paths'] as Record<string, unknown>)
      : {}
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!isRecord(pathItem))
      continue
    for (const method of HTTP_METHODS.map((item) => item.toLowerCase())) {
      if (!isRecord(pathItem[method]))
        continue
      const servers = Array.isArray(doc['servers']) ? doc['servers'] : []
      const firstServer = servers[0]
      const baseUrl =
        isRecord(firstServer) && typeof firstServer['url'] === 'string' ? firstServer['url'] : ''
      const joined =
        baseUrl && path.startsWith('/')
          ? `${baseUrl.replace(/\/$/, '')}${path}`
          : baseUrl
            ? `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
            : path
      return { method: normalizeMethod(method), path: joined, baseUrl }
    }
  }
  return null
}

function parseOpenApiDocument(text: string): UrlPasteIngestPreview | null {
  let parsed: unknown
  try {
    parsed = parseImportDocument(text)
  } catch {
    try {
      parsed = parseYaml(text)
    } catch {
      return null
    }
  }
  if (detectImportFormat(parsed) !== 'openapi')
    return null
  if (!isRecord(parsed))
    return null
  const first = firstOpenApiOperation(parsed)
  if (!first)
    return null
  return {
    kind: 'openapi-doc',
    label: 'OpenAPI document',
    detail: `${first.method} ${first.path}`,
    method: first.method,
    url: first.path,
  }
}

/**
 * Detects structured paste payloads for the request URL field (beyond plain text).
 */
export function detectUrlPasteIngest(text: string): UrlPasteIngestPreview | null {
  const trimmed = text.trim()
  if (!trimmed)
    return null

  if (looksLikeCurl(trimmed)) {
    const parsed = parseCurl(trimmed)
    if (!parsed)
      return null
    return {
      kind: 'curl',
      label: 'cURL command',
      detail: `${parsed.method} ${parsed.url}`,
      method: parsed.method,
      url: parsed.url,
      headers: parsed.headers,
      body: parsed.body || undefined,
    }
  }

  const openapiPath = parseOpenApiPathLine(trimmed)
  if (openapiPath)
    return openapiPath

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const jsonRequest = parseJsonRequest(trimmed)
    if (jsonRequest)
      return jsonRequest
    const openapiDoc = parseOpenApiDocument(trimmed)
    if (openapiDoc)
      return openapiDoc
  }

  if (trimmed.includes('openapi') || trimmed.includes('paths:')) {
    const openapiDoc = parseOpenApiDocument(trimmed)
    if (openapiDoc)
      return openapiDoc
  }

  return null
}
