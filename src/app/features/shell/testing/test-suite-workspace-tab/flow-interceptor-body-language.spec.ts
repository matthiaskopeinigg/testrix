import { describe, expect, it } from 'vitest';

import {
  flowBodyEditorLanguage,
  flowBodyEditorLanguageLabel,
  flowBodyEditorPlaceholder,
  flowBodyEditorVisible,
  interceptorBodyEditorLanguage,
} from './flow-interceptor-body-language';

describe('flowBodyEditorLanguage', () => {
  it('maps body types to code editor languages', () => {
    expect(flowBodyEditorLanguage('json')).toBe('json');
    expect(flowBodyEditorLanguage('xml')).toBe('xml');
    expect(flowBodyEditorLanguage('graphql')).toBe('graphql');
    expect(flowBodyEditorLanguage('text')).toBe('plaintext');
    expect(flowBodyEditorLanguage('none')).toBe('plaintext');
    expect(interceptorBodyEditorLanguage('json')).toBe('json');
  });
});

describe('flowBodyEditorVisible', () => {
  it('hides editor for none', () => {
    expect(flowBodyEditorVisible('none')).toBe(false);
    expect(flowBodyEditorVisible(undefined)).toBe(false);
    expect(flowBodyEditorVisible('json')).toBe(true);
  });
});

describe('flowBodyEditorPlaceholder', () => {
  it('returns type-specific placeholders', () => {
    expect(flowBodyEditorPlaceholder('json')).toContain('{{userName}}');
    expect(flowBodyEditorPlaceholder('graphql')).toContain('query');
  });
});
