import { describe, expect, it } from 'vitest';

import { tryFormatCodeEditorContent, tryParseJsonLenient } from './tx-code-editor-format';

const SAMPLE = `{
  "dummy": "$uuid",
  "dummy2": "{{env1}}",
}`;

describe('tryFormatCodeEditorContent JSON', () => {
  it('parses JSON with trailing comma and template placeholders', () => {
    expect(tryParseJsonLenient(SAMPLE.trim())).not.toBeNull();
  });

  it('formats JSON with trailing comma and preserves template placeholders', () => {
    const out = tryFormatCodeEditorContent(SAMPLE, 'json');
    expect(out).not.toBeNull();
    expect(out).toContain('"dummy": "$uuid"');
    expect(out).toContain('"dummy2": "{{env1}}"');
    expect(out).not.toMatch(/,\s*\n\}/);
  });
});
