import { describe, expect, it } from 'vitest';

import { findTxCodeEditorFoldRegions } from './tx-code-editor-folding';
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

  it('highlights SQL and Redis query languages', () => {
    const sql = highlightCodeEditorContent('SELECT * FROM users WHERE id = 1', 'sql');
    expect(sql).toContain('token-keyword">SELECT</span>');
    expect(sql).toContain('token-keyword">FROM</span>');

    const redis = highlightCodeEditorContent('SET key "hello world"', 'redis');
    expect(redis).toContain('token-keyword">SET</span>');
    expect(redis).toContain('token-string');
  });
});

describe('highlightCodeEditorContent fold placeholders', () => {
  it('wraps collapsed ellipsis lines in clickable spans', () => {
    const sample = `{
  "widget": {
    "text": {
      "data": "Click Me"
    }
  }
}`;
    const regions = findTxCodeEditorFoldRegions(sample, 'json');
    const outer = regions.find((r) => r.startLine === 0);
    expect(outer).toBeDefined();
    if (!outer) {
      return;
    }

    const display = `{\n  ...\n}`;
    const html = highlightCodeEditorContent(display, 'json', [], {
      canonical: sample,
      collapsedIds: new Set([outer.id]),
      regions,
    });
    expect(html).toContain('tx-fold-placeholder');
    expect(html).toContain(`data-fold-id="${outer.id}"`);
  });
});
