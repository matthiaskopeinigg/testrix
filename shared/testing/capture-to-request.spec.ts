import { describe, expect, it } from 'vitest';

import {
  buildRequestStepConfigFromCapture,
  buildValidationStepConfigFromCapture,
  captureEntryRequestLabel,
  captureFlowNameFromEntry,
  coerceCaptureHttpMethod,
} from './capture-to-request';
import type { CaptureLogEntry } from './capture-log-entry.schema';

function sampleEntry(overrides: Partial<CaptureLogEntry> = {}): CaptureLogEntry {
  return {
    id: 'e1',
    captureItemId: 's1',
    method: 'POST',
    url: 'https://api.example.com/v1/items',
    at: '2020-01-01T00:00:00.000Z',
    requestHeaders: [{ key: 'Content-Type', value: 'application/json' }],
    responseHeaders: [],
    requestBody: '{"id":1}',
    responseBody: '',
    requestBodyTruncated: false,
    requestBodyIsBinary: false,
    responseBodyTruncated: false,
    responseBodyIsBinary: false,
    ...overrides,
  };
}

describe('capture-to-request', () => {
  it('coerces unknown methods to GET', () => {
    expect(coerceCaptureHttpMethod('FOO')).toBe('GET');
    expect(coerceCaptureHttpMethod('patch')).toBe('PATCH');
  });

  it('builds labels from url without duplicating method', () => {
    const label = captureEntryRequestLabel(sampleEntry());
    expect(label).toContain('api.example.com');
    expect(label.toUpperCase().startsWith('POST ')).toBe(false);
  });

  it('maps capture entry to flow REQUEST config', () => {
    const config = buildRequestStepConfigFromCapture(sampleEntry());
    expect(config.method).toBe('POST');
    expect(config.url).toBe('https://api.example.com/v1/items');
    expect(config.bodyType).toBe('json');
    expect(config.headers).toHaveLength(1);
  });

  it('builds flow name from method and url', () => {
    expect(captureFlowNameFromEntry(sampleEntry())).toContain('POST');
    expect(captureFlowNameFromEntry(sampleEntry())).toContain('api.example.com');
  });

  it('builds validation config from captured response', () => {
    const entry = sampleEntry({
      statusCode: 400,
      responseBody: '{"error":"bad"}',
      responseHeaders: [{ key: 'Content-Type', value: 'application/json' }],
    });
    const config = buildValidationStepConfigFromCapture(entry, 'req-1');
    expect(config.refStepId).toBe('req-1');
    expect(config.rules[0]).toMatchObject({
      source: 'response_status',
      operator: 'equals',
      expected: '400',
    });
    expect(config.rules.some((r) => r.source === 'response_body')).toBe(true);
  });
});
