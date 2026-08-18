import { describe, expect, it } from 'vitest';

import { resolveFlowRequestStepSource } from './test-suite-steps.schema';

describe('resolveFlowRequestStepSource', () => {
  it('keeps a manual REQUEST when a leftover collection id is still set', () => {
    expect(
      resolveFlowRequestStepSource({
        requestSource: 'manual',
        collectionRequestId: 'req-old',
      }),
    ).toBe('manual');
  });

  it('uses the collection picker when the source is collection', () => {
    expect(
      resolveFlowRequestStepSource({
        requestSource: 'collection',
        collectionRequestId: 'req-1',
      }),
    ).toBe('collection');
  });
});
