import { describe, expect, it } from 'vitest';

import { highlightCodeEditorContent, highlightHtml } from './tx-code-editor-highlight';

describe('highlightCodeEditorContent JSON with catalog', () => {
  it('keeps JSON token classes alongside template variable spans', () => {
    const html = highlightCodeEditorContent(
      '{\n  "dummy": "$uuid",\n  "dummy2": "{{env1}}"\n}',
      'json',
      [{ id: 'uuid', label: '$uuid', insert: '$uuid', detail: '' }],
    );
    expect(html).toContain('token-key');
    expect(html).toContain('token-string');
    expect(html).toContain('tx-var-token');
    expect(html).toContain('$uuid');
  });
});

describe('highlightHtml', () => {
  it('highlights tags with quoted attributes containing entities', () => {
    const escaped =
      '&lt;div class=&quot;nav&amp;main&quot; id=&quot;x&quot;&gt;Text&lt;/div&gt;';
    const out = highlightHtml(escaped);
    expect(out).toContain('token-attribute');
    expect(out).toContain('token-string');
    expect(out).toContain('class=');
    expect(out).toContain('&quot;nav&amp;main&quot;');
  });

  it('highlights CSS inside style blocks and SCSS variables', () => {
    const escaped =
      '&lt;style&gt;body { color: red; }&lt;/style&gt;&lt;style lang=&quot;scss&quot;&gt;$c: blue; .a { color: $c; }&lt;/style&gt;';
    const out = highlightHtml(escaped);
    expect(out).toContain('token-key">body</span>');
    expect(out).toContain('token-attribute">color</span>');
    expect(out).toMatch(/token-attribute">\$c/);
  });

  it('highlights standalone CSS and SCSS languages', () => {
    const css = highlightCodeEditorContent('.btn { padding: 4px; }', 'css');
    expect(css).toContain('token-key');
    expect(css).toContain('token-attribute');

    const scss = highlightCodeEditorContent('$gap: 8px; .x { margin: $gap; }', 'scss');
    expect(scss).toContain('token-attribute');
    expect(scss).toContain('$gap');
  });
});
