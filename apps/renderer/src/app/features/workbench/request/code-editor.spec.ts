import { describe, expect, it } from 'vitest';

import { canFormatLanguage, codeEditorLanguageFromBodyMode, languageFromContentType } from './code-editor-language';
import {
  formatCode,
  formatResponseBody,
  lintCode,
  maskPlaceholders,
  RESPONSE_FORMAT_LIMIT,
  unmaskPlaceholders,
} from './code-editor-format';
import { placeholderCompletionItems } from './code-editor-placeholders';

describe('codeEditorLanguageFromBodyMode', () => {
  it('maps body modes onto editor languages', () => {
    expect(codeEditorLanguageFromBodyMode('json')).toBe('json');
    expect(codeEditorLanguageFromBodyMode('html')).toBe('html');
    expect(codeEditorLanguageFromBodyMode('xml')).toBe('xml');
    expect(codeEditorLanguageFromBodyMode('graphql')).toBe('graphql');
    expect(codeEditorLanguageFromBodyMode('text')).toBe('text');
    expect(codeEditorLanguageFromBodyMode('none')).toBe('text');
    expect(codeEditorLanguageFromBodyMode('binary')).toBe('text');
  });

  it('detects languages from content type and body', () => {
    expect(languageFromContentType('application/json', '')).toBe('json');
    expect(languageFromContentType('text/html', '')).toBe('html');
    expect(languageFromContentType('image/svg+xml', '')).toBe('xml');
    expect(languageFromContentType('application/javascript', '')).toBe('javascript');
    expect(languageFromContentType('text/css', '')).toBe('css');
    expect(languageFromContentType('text/plain', '{"a":1}')).toBe('json');
    expect(languageFromContentType('', '<html></html>')).toBe('html');
    expect(languageFromContentType('application/graphql', '')).toBe('graphql');
    expect(languageFromContentType('', 'query { user { id } }')).toBe('graphql');
  });

  it('formats json, html, xml, and graphql only', () => {
    expect(canFormatLanguage('json')).toBe(true);
    expect(canFormatLanguage('html')).toBe(true);
    expect(canFormatLanguage('xml')).toBe(true);
    expect(canFormatLanguage('graphql')).toBe(true);
    expect(canFormatLanguage('javascript')).toBe(false);
    expect(canFormatLanguage('css')).toBe(false);
    expect(canFormatLanguage('text')).toBe(false);
  });
});

describe('maskPlaceholders', () => {
  it('round-trips mustache and $ tokens', () => {
    const source = '{ "id": {{id}}, "nonce": $uuid }';
    const masked = maskPlaceholders(source);
    expect(masked.text).toContain('__TXPH_0__');
    expect(masked.tokens).toEqual(['{{id}}', '$uuid']);
    expect(unmaskPlaceholders(masked.text, masked.tokens)).toBe(source);
  });
});

describe('formatCode', () => {
  it('pretty-prints JSON and restores placeholders', () => {
    expect(formatCode('{"id":{{id}},"ok":true}', 'json')).toBe('{\n  "id": "{{id}}",\n  "ok": true\n}\n');
  });

  it('leaves invalid JSON unchanged', () => {
    expect(formatCode('{not json', 'json')).toBe('{not json');
  });

  it('pretty-prints GraphQL and restores placeholders', () => {
    const formatted = formatCode('query { user(id: {{id}}) { name } }', 'graphql');
    expect(formatted).toContain('user');
    expect(formatted).toContain('{{id}}');
  });

  it('indents HTML tags', () => {
    expect(formatCode('<div><span>{{host}}</span></div>', 'html')).toBe(
      '<div>\n  <span>\n    {{host}}\n  </span>\n</div>\n',
    );
  });

  it('does not format plaintext', () => {
    expect(formatCode('  hello', 'text')).toBe('  hello');
  });
});

describe('lintCode', () => {
  it('reports JSON parse errors', () => {
    expect(lintCode('{', 'json').length).toBeGreaterThan(0);
    expect(lintCode('{"ok":true}', 'json')).toEqual([]);
  });

  it('accepts JSON with placeholders', () => {
    expect(lintCode('{ "id": {{id}} }', 'json')).toEqual([]);
  });

  it('reports GraphQL parse errors', () => {
    expect(lintCode('{', 'graphql').length).toBeGreaterThan(0);
  });
});

describe('placeholderCompletionItems', () => {
  it('lists matching $ catalog items', () => {
    const items = placeholderCompletionItems('$u', 2, ['host']);
    expect(items.map((item) => item.label)).toEqual(['$uuid']);
  });

  it('lists matching variables for mustache tokens', () => {
    const items = placeholderCompletionItems('{{ho', 4, ['host', 'id']);
    expect(items.map((item) => item.apply)).toEqual(['{{host}}']);
  });
});

describe('formatResponseBody', () => {
  it('formats normal bodies and leaves huge ones as received', () => {
    // Arrange
    const huge = `[${'1,'.repeat(RESPONSE_FORMAT_LIMIT / 2)}1]`;

    // Act
    const small = formatResponseBody('{"a":1}', 'json');
    const large = formatResponseBody(huge, 'json');

    // Assert
    expect(small).toBe('{\n  "a": 1\n}\n');
    expect(large).toBe(huge);
  });

  it('sniffs the language after leading whitespace', () => {
    // Arrange
    const body = '   {}';

    // Act
    const language = languageFromContentType('', body);

    // Assert
    expect(language).toBe('json');
  });
});
