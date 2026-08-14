import {
  collectionRequestBodySchema,
  createDefaultCollectionRequestBody,
  createHttpKeyValueRow,
  type CollectionRequestBody,
} from '../config/collection-request-settings.schema';
import type { RequestStepConfig } from './test-suite-steps.schema';

/** Maps a flow REQUEST step legacy body type to a collection body mode. */
function legacyBodyTypeToMode(
  bodyType: RequestStepConfig['bodyType'],
): CollectionRequestBody['mode'] | null {
  switch (bodyType) {
    case 'none':
      return 'none';
    case 'json':
    case 'xml':
    case 'text':
    case 'graphql':
    case 'form-data':
    case 'binary':
      return bodyType;
    case 'urlencoded':
      return 'x-www-form-urlencoded';
    default:
      return null;
  }
}

function parseUrlEncodedFields(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }
  const params = new URLSearchParams(trimmed);
  const rows = [...params.entries()].map(([key, value]) =>
    createHttpKeyValueRow({ key, value, enabled: true }),
  );
  return rows.length > 0 ? rows : [createHttpKeyValueRow()];
}

function serializeUrlEncodedFields(
  fields: readonly { readonly key: string; readonly value?: string; readonly enabled?: boolean }[],
): string {
  const params = new URLSearchParams();
  for (const row of fields) {
    if (row.enabled !== false && row.key.trim()) {
      params.append(row.key.trim(), row.value ?? '');
    }
  }
  return params.toString();
}

/** Resolves the collection-style body editor model for a flow REQUEST step. */
export function flowRequestStepCollectionBody(cfg: RequestStepConfig): CollectionRequestBody {
  if (cfg.requestBody) {
    return collectionRequestBodySchema.parse(cfg.requestBody);
  }

  const mode = legacyBodyTypeToMode(cfg.bodyType ?? 'none');
  if (!mode || mode === 'none') {
    return createDefaultCollectionRequestBody();
  }

  switch (mode) {
    case 'json':
    case 'xml':
    case 'text':
      return { mode, raw: cfg.body ?? '' };
    case 'graphql':
      return {
        mode: 'graphql',
        query: cfg.body ?? '',
        variables: '',
      };
    case 'x-www-form-urlencoded':
      return {
        mode: 'x-www-form-urlencoded',
        fields: parseUrlEncodedFields(cfg.body ?? ''),
      };
    case 'form-data':
      return { mode: 'form-data', fields: [] };
    case 'binary':
      if (cfg.binaryFilePath?.trim()) {
        return {
          mode: 'binary',
          source: 'file',
          filePath: cfg.binaryFilePath,
          contentType: cfg.binaryContentType,
        };
      }
      return {
        mode: 'binary',
        source: 'inline',
        contentBase64: cfg.body ?? '',
        contentType: cfg.binaryContentType,
      };
    default:
      return createDefaultCollectionRequestBody();
  }
}

/** Applies a collection-style body back onto a flow REQUEST step config. */
export function patchRequestStepFromCollectionBody(
  body: CollectionRequestBody,
): Partial<RequestStepConfig> {
  const parsed = collectionRequestBodySchema.parse(body);
  const patch: Partial<RequestStepConfig> = { requestBody: parsed };

  switch (parsed.mode) {
    case 'none':
      patch.bodyType = 'none';
      patch.body = '';
      patch.binaryFilePath = undefined;
      patch.binaryContentType = undefined;
      break;
    case 'json':
    case 'xml':
    case 'text':
      patch.bodyType = parsed.mode;
      patch.body = parsed.raw;
      patch.binaryFilePath = undefined;
      patch.binaryContentType = undefined;
      break;
    case 'graphql':
      patch.bodyType = 'graphql';
      patch.body = parsed.query;
      patch.binaryFilePath = undefined;
      patch.binaryContentType = undefined;
      break;
    case 'x-www-form-urlencoded':
      patch.bodyType = 'urlencoded';
      patch.body = serializeUrlEncodedFields(parsed.fields);
      patch.binaryFilePath = undefined;
      patch.binaryContentType = undefined;
      break;
    case 'form-data':
      patch.bodyType = 'form-data';
      patch.body = '';
      patch.binaryFilePath = undefined;
      patch.binaryContentType = undefined;
      break;
    case 'binary':
      patch.bodyType = 'binary';
      patch.binaryContentType = parsed.contentType;
      if (parsed.source === 'file' && parsed.filePath?.trim()) {
        patch.binaryFilePath = parsed.filePath;
        patch.body = '';
      } else {
        patch.binaryFilePath = undefined;
        patch.body = parsed.contentBase64 ?? '';
      }
      break;
    default:
      break;
  }

  return patch;
}
