import { describe, expect, it } from 'vitest';

import { interceptorBodyEditorLanguage } from './flow-interceptor-body-language';

describe('interceptorBodyEditorLanguage', () => {
  it('maps body types to code editor languages', () => {
    expect(interceptorBodyEditorLanguage('json')).toBe('json');
    expect(interceptorBodyEditorLanguage('xml')).toBe('xml');
    expect(interceptorBodyEditorLanguage('graphql')).toBe('graphql');
    expect(interceptorBodyEditorLanguage('text')).toBe('plaintext');
    expect(interceptorBodyEditorLanguage('none')).toBe('plaintext');
  });
});
