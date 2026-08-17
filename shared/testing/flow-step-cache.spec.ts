import { describe, expect, it } from 'vitest';

import { buildHttpResponseStepCapture } from './flow-step-capture';
import {
  cacheSourcesForReferenceStepType,
  defaultCacheEntryForReferenceStepType,
  generatedCacheEntryTemplate,
  isGeneratedCacheEntry,
  normalizeCacheEntryForReferenceStepType,
  resolveCacheEntryValue,
  sanitizeCacheEntriesForReferenceStepType,
} from './flow-step-cache';
import { cacheStepEntrySchema, createDefaultCacheStepConfig } from './test-suite-steps.schema';

describe('flow-step-cache', () => {
  it('normalizes request_body to response_body for HTTP cache entries', () => {
    expect(
      normalizeCacheEntryForReferenceStepType('REQUEST', {
        variableName: 'userId',
        source: 'request_body',
        expression: '',
        extractKind: 'jsonpath',
        extract: '$[0].id',
      }),
    ).toEqual({
      variableName: 'userId',
      source: 'response_body',
      expression: '',
      extractKind: 'jsonpath',
      extract: '$[0].id',
    });
  });

  it('extracts jsonpath values from a referenced HTTP response capture', () => {
    const capture = buildHttpResponseStepCapture({
      status: { code: 200, text: 'OK' },
      body: {
        text: JSON.stringify([{ id: 1, username: 'Bret' }, { id: 2, username: 'Antonette' }]),
      },
      headers: [],
    });

    expect(
      resolveCacheEntryValue(capture, {
        variableName: 'userId',
        source: 'response_body',
        expression: '',
        extractKind: 'jsonpath',
        extract: '$[0].id',
      }),
    ).toBe('1');
  });

  it('defaults new cache steps to a generated value with no reference step', () => {
    const config = createDefaultCacheStepConfig();
    expect(config.refStepId).toBeNull();
    expect(config.entries[0]?.source).toBe('generated');
    expect(isGeneratedCacheEntry(defaultCacheEntryForReferenceStepType(null))).toBe(true);
    expect(cacheSourcesForReferenceStepType(null)).toEqual(['generated']);
  });

  it('keeps generated entries when a reference step is selected', () => {
    const generated = {
      variableName: 'email',
      source: 'generated' as const,
      expression: '',
      value: 'test-$uuid@gmail.com',
      extractKind: 'full' as const,
      extract: '',
    };
    const sanitized = sanitizeCacheEntriesForReferenceStepType('REQUEST', [generated]);
    expect(sanitized).toEqual([generated]);
  });

  it('keeps generated entries and drops extract sources when the reference is cleared', () => {
    const sanitized = sanitizeCacheEntriesForReferenceStepType(null, [
      {
        variableName: 'email',
        source: 'generated',
        expression: '',
        value: 'test-$uuid@gmail.com',
      },
      {
        variableName: 'userId',
        source: 'response_body',
        expression: '',
        extractKind: 'jsonpath',
        extract: '$[0].id',
      },
    ]);
    expect(sanitized).toHaveLength(1);
    expect(sanitized[0]?.variableName).toBe('email');
    expect(sanitized[0]?.source).toBe('generated');
  });

  it('parses legacy cache entries without a value field', () => {
    expect(
      cacheStepEntrySchema.parse({
        variableName: 'userId',
        source: 'response_body',
        expression: '',
        extractKind: 'jsonpath',
        extract: '$[0].id',
      }).value,
    ).toBeUndefined();
  });

  it('defaults cipher mode to none on legacy CACHE entries', () => {
    const parsed = cacheStepEntrySchema.parse({
      variableName: 'encryptedPw',
      source: 'generated',
      value: '{{plainPw}}',
    });
    expect(parsed.cipher?.mode ?? 'none').toBe('none');
    expect(createDefaultCacheStepConfig().entries[0]?.cipher?.mode ?? 'none').toBe('none');
  });

  it('reads the generated template from the value field', () => {
    expect(
      generatedCacheEntryTemplate({
        variableName: 'email',
        source: 'generated',
        expression: '',
        value: 'test-$uuid@gmail.com',
      }),
    ).toBe('test-$uuid@gmail.com');
  });
});
