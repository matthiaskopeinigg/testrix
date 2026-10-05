import { describe, expect, it } from 'vitest';

import { parseMarkdown } from './markdown';

describe('parseMarkdown', () => {
  it('tokenizes headings, emphasis, links, and fenced code', () => {
    const blocks = parseMarkdown(
      '# Title\n\nHello **world** and `code` with [docs](https://example.com).\n\n```\nconst x = 1\n```\n',
    );
    expect(blocks[0]).toMatchObject({ kind: 'heading', level: 1 });
    expect(blocks[1]).toMatchObject({ kind: 'paragraph' });
    const paragraph = blocks[1];
    if (paragraph.kind !== 'paragraph')
      throw new Error('expected paragraph');
    expect(paragraph.inlines.some((part) => part.kind === 'strong' && part.text === 'world')).toBe(true);
    expect(paragraph.inlines.some((part) => part.kind === 'code' && part.text === 'code')).toBe(true);
    expect(
      paragraph.inlines.some(
        (part) => part.kind === 'link' && part.href === 'https://example.com',
      ),
    ).toBe(true);
    expect(blocks[2]).toEqual({ kind: 'code', text: 'const x = 1', language: '' });
  });

  it('tokenizes tables, rules, strike, and fenced language', () => {
    const blocks = parseMarkdown(
      '~~old~~\n\n---\n\n```js\nconst x = 1\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n',
    );
    expect(blocks[0]).toMatchObject({ kind: 'paragraph' });
    const paragraph = blocks[0];
    if (paragraph.kind !== 'paragraph')
      throw new Error('expected paragraph');
    expect(paragraph.inlines.some((part) => part.kind === 'strike' && part.text === 'old')).toBe(true);
    expect(blocks[1]).toEqual({ kind: 'hr' });
    expect(blocks[2]).toEqual({ kind: 'code', text: 'const x = 1', language: 'js' });
    expect(blocks[3]).toEqual({ kind: 'table', headers: ['A', 'B'], rows: [['1', '2']] });
  });

  it('drops javascript: links', () => {
    const blocks = parseMarkdown('[x](javascript:alert(1))');
    const paragraph = blocks[0];
    if (paragraph.kind !== 'paragraph')
      throw new Error('expected paragraph');
    expect(paragraph.inlines[0]).toMatchObject({ kind: 'link', href: '' });
  });
});
