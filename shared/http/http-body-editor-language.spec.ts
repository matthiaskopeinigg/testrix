import { describe, expect, it } from 'vitest';

import {
  contentTypeFromBodySyntax,
  formatHttpBodyForPreview,
  inferHttpBodySyntaxMode,
  inferHttpBodySyntaxModeFromHeaders,
} from './http-body-editor-language';

describe('inferHttpBodySyntaxMode', () => {
  it('returns plain for binary bodies', () => {
    expect(inferHttpBodySyntaxMode('application/json', '{}', true)).toBe('plain');
  });

  it('detects JSON from content-type', () => {
    expect(inferHttpBodySyntaxMode('application/json', 'x', false)).toBe('json');
    expect(inferHttpBodySyntaxMode('application/problem+json', '', false)).toBe('json');
  });

  it('detects HTML before generic angle-bracket XML heuristic', () => {
    expect(inferHttpBodySyntaxMode('text/html; charset=utf-8', '', false)).toBe('html');
    expect(inferHttpBodySyntaxMode('', '<!DOCTYPE html><html></html>', false)).toBe('html');
  });

  it('detects CSS and SCSS from content-type', () => {
    expect(inferHttpBodySyntaxMode('text/css; charset=utf-8', '', false)).toBe('css');
    expect(inferHttpBodySyntaxMode('text/x-scss', '', false)).toBe('scss');
  });

  it('detects XML from content-type or markup', () => {
    expect(inferHttpBodySyntaxMode('application/xml', '', false)).toBe('xml');
    expect(inferHttpBodySyntaxMode('', '<foo/>', false)).toBe('xml');
  });
});

describe('contentTypeFromBodySyntax', () => {
  it('maps syntax modes to MIME types', () => {
    expect(contentTypeFromBodySyntax('json')).toBe('application/json');
    expect(contentTypeFromBodySyntax('xml')).toBe('application/xml');
    expect(contentTypeFromBodySyntax('html')).toBe('text/html');
    expect(contentTypeFromBodySyntax('plain')).toBe('text/plain');
  });
});

describe('inferHttpBodySyntaxModeFromHeaders', () => {
  it('reads content-type from header rows', () => {
    expect(
      inferHttpBodySyntaxModeFromHeaders(
        [{ key: 'Content-Type', value: 'application/json' }],
        '{}',
        false,
      ),
    ).toBe('json');
  });
});

describe('formatHttpBodyForPreview', () => {
  it('pretty-prints JSON only', () => {
    expect(formatHttpBodyForPreview('{"a":1}', 'json', false)).toBe('{\n  "a": 1\n}');
    expect(formatHttpBodyForPreview('<a/>', 'xml', false)).toBe('<a/>');
  });
});
