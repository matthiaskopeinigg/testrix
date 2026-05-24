import { describe, expect, it } from 'vitest';

import { flowRequestStepCollectionBody, patchRequestStepFromCollectionBody } from './flow-request-body';
import type { RequestStepConfig } from './test-suite-steps.schema';

describe('flowRequestStepCollectionBody', () => {
  it('prefers requestBody when present', () => {
    const body = flowRequestStepCollectionBody({
      bodyType: 'none',
      body: '',
      requestBody: { mode: 'json', raw: '{"a":1}' },
    } as RequestStepConfig);
    expect(body).toEqual({ mode: 'json', raw: '{"a":1}' });
  });

  it('maps legacy json body fields', () => {
    const body = flowRequestStepCollectionBody({
      bodyType: 'json',
      body: '{"hello":"world"}',
    } as RequestStepConfig);
    expect(body).toEqual({ mode: 'json', raw: '{"hello":"world"}' });
  });

  it('maps legacy urlencoded body to fields', () => {
    const body = flowRequestStepCollectionBody({
      bodyType: 'urlencoded',
      body: 'a=1&b=two',
    } as RequestStepConfig);
    expect(body).toMatchObject({
      mode: 'x-www-form-urlencoded',
      fields: [
        expect.objectContaining({ key: 'a', value: '1' }),
        expect.objectContaining({ key: 'b', value: 'two' }),
      ],
    });
  });
});

describe('patchRequestStepFromCollectionBody', () => {
  it('stores requestBody and legacy fields together', () => {
    const patch = patchRequestStepFromCollectionBody({ mode: 'json', raw: '{"x":1}' });
    expect(patch.requestBody).toEqual({ mode: 'json', raw: '{"x":1}' });
    expect(patch.bodyType).toBe('json');
    expect(patch.body).toBe('{"x":1}');
  });

  it('serializes urlencoded fields to legacy body string', () => {
    const patch = patchRequestStepFromCollectionBody({
      mode: 'x-www-form-urlencoded',
      fields: [
        { id: '1', key: 'a', value: '1', enabled: true },
        { id: '2', key: 'b', value: 'two', enabled: true },
      ],
    });
    expect(patch.bodyType).toBe('urlencoded');
    expect(patch.body).toBe('a=1&b=two');
  });
});
