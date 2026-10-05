import { highlightTree, tagHighlighter, tags } from '@lezer/highlight';

import type { CodeEditorLanguage } from './code-editor-language';
import { highlightLanguage } from './code-editor-support';

export interface CodeHighlightToken {
  readonly kind: string;
  readonly text: string;
}

const highlighter = tagHighlighter([
  { tag: tags.keyword, class: 'keyword' },
  { tag: tags.bool, class: 'keyword' },
  { tag: tags.atom, class: 'keyword' },
  { tag: tags.null, class: 'comment' },
  { tag: tags.string, class: 'string' },
  { tag: tags.number, class: 'number' },
  { tag: tags.comment, class: 'comment' },
  { tag: tags.propertyName, class: 'property' },
  { tag: tags.tagName, class: 'tag' },
  { tag: tags.attributeName, class: 'attribute' },
  { tag: tags.attributeValue, class: 'string' },
  { tag: tags.variableName, class: 'variable' },
  { tag: tags.operator, class: 'punct' },
  { tag: tags.punctuation, class: 'punct' },
  { tag: tags.className, class: 'tag' },
  { tag: tags.typeName, class: 'tag' },
  { tag: tags.angleBracket, class: 'punct' },
  { tag: tags.invalid, class: 'invalid' },
]);

/**
 * Tokenizes source into styled spans using the same language modes as the code editor.
 */
export function highlightCode(source: string, language: CodeEditorLanguage): readonly CodeHighlightToken[] {
  if (!source)
    return [];
  if (language === 'text')
    return [{ kind: 'text', text: source }];

  const lang = highlightLanguage(language);
  if (!lang)
    return [{ kind: 'text', text: source }];

  try {
    const tree = lang.parser.parse(source);
    const tokens: CodeHighlightToken[] = [];
    let pos = 0;
    highlightTree(tree, highlighter, (from, to, classes) => {
      if (from > pos)
        tokens.push({ kind: 'text', text: source.slice(pos, from) });
      const kind = classes.trim().split(/\s+/).find(Boolean) ?? 'text';
      tokens.push({ kind, text: source.slice(from, to) });
      pos = to;
    });
    if (pos < source.length)
      tokens.push({ kind: 'text', text: source.slice(pos) });
    return mergeAdjacent(tokens);
  } catch {
    return [{ kind: 'text', text: source }];
  }
}

function mergeAdjacent(tokens: readonly CodeHighlightToken[]): readonly CodeHighlightToken[] {
  const out: CodeHighlightToken[] = [];
  for (const token of tokens) {
    if (!token.text)
      continue;
    const last = out[out.length - 1];
    if (last && last.kind === token.kind) {
      out[out.length - 1] = { kind: last.kind, text: last.text + token.text };
      continue;
    }
    out.push(token);
  }
  return out;
}
