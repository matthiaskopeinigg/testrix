import type { Completion, CompletionContext, CompletionResult, CompletionSource } from '@codemirror/autocomplete';
import { completeFromList, snippetCompletion } from '@codemirror/autocomplete';
import { Facet, RangeSetBuilder } from '@codemirror/state';
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';

import { splitPlaceholderSegments, suggestPlaceholders, tokenAtCaret } from './placeholder-complete';
import type { PlaceholderOrigin } from './placeholder-origin';

export const placeholderVariablesFacet = Facet.define<readonly string[], readonly string[]>({
  combine(values) {
    return values[values.length - 1] ?? [];
  },
});

export const placeholderOriginsFacet = Facet.define<readonly PlaceholderOrigin[], readonly PlaceholderOrigin[]>({
  combine(values) {
    return values[values.length - 1] ?? [];
  },
});

export function placeholderCompletionItems(
  value: string,
  cursor: number,
  variables: readonly string[],
): Completion[] {
  return suggestPlaceholders(value, cursor, variables).map((item) => ({
    label: item.label,
    detail: item.detail,
    apply: item.insert,
    type: item.insert.startsWith('{{') ? 'variable' : 'keyword',
  }));
}

export const placeholderCompletionSource: CompletionSource = (context: CompletionContext): CompletionResult | null => {
  const value = context.state.doc.toString();
  const token = tokenAtCaret(value, context.pos);
  if (!context.explicit && token.kind === 'none')
    return null;
  const items = placeholderCompletionItems(value, context.pos, context.state.facet(placeholderVariablesFacet));
  if (items.length === 0)
    return null;
  return { from: token.kind === 'none' ? context.pos : token.start, to: token.kind === 'none' ? context.pos : token.end, options: items };
};

export const graphqlKeywordSource: CompletionSource = completeFromList([
  'query',
  'mutation',
  'subscription',
  'fragment',
  'on',
  'true',
  'false',
  'null',
  'schema',
  'extend',
  'scalar',
  'type',
  'interface',
  'union',
  'enum',
  'input',
  'directive',
  'implements',
].map((label) => ({ label, type: 'keyword' })));

export const htmlTagSource: CompletionSource = completeFromList(
  ['div', 'span', 'p', 'a', 'ul', 'li', 'table', 'tr', 'td', 'form', 'input', 'button', 'script', 'style'].map((tag) =>
    snippetCompletion(`<${tag}>$\{}</${tag}>`, { label: tag, type: 'keyword' }),
  ),
);

export function placeholderDecorations() {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildPlaceholderDecorations(view);
      }

      update(update: ViewUpdate): void {
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.state.facet(placeholderVariablesFacet) !== update.startState.facet(placeholderVariablesFacet) ||
          update.state.facet(placeholderOriginsFacet) !== update.startState.facet(placeholderOriginsFacet)
        )
          this.decorations = buildPlaceholderDecorations(update.view);
      }
    },
    { decorations: (value) => value.decorations },
  );
}

function placeholderMarkClass(kind: 'dollar' | 'mustache' | 'path', _hint: string, clickable: boolean): string {
  const link = clickable ? ' is-link' : '';
  if (kind === 'mustache')
    return `tx-code-ph is-var${link}`;
  return `tx-code-ph${link}`;
}

function placeholderMarkAttributes(part: {
  readonly clickable?: boolean;
  readonly originKind?: 'folder' | 'environment' | 'path' | 'data';
  readonly sourceId?: string;
  readonly sourceName?: string;
  readonly originName?: string;
}): Record<string, string> | undefined {
  if (!part.clickable || !part.originKind)
    return undefined;
  return {
    'data-tx-ph-kind': part.originKind,
    'data-tx-ph-id': part.sourceId ?? '',
    'data-tx-ph-name': part.sourceName ?? '',
    'data-tx-ph-key': part.originName ?? '',
  };
}

function buildPlaceholderDecorations(view: EditorView): DecorationSet {
  const variables = view.state.facet(placeholderVariablesFacet);
  const origins = view.state.facet(placeholderOriginsFacet);
  const text = view.state.doc.toString();
  const builder = new RangeSetBuilder<Decoration>();
  let pos = 0;
  for (const part of splitPlaceholderSegments(text, variables, { origins })) {
    const from = pos;
    const to = pos + part.text.length;
    pos = to;
    if (part.kind === 'text' || from === to)
      continue;
    builder.add(
      from,
      to,
      Decoration.mark({
        class: placeholderMarkClass(part.kind, part.hint, part.clickable === true),
        attributes: placeholderMarkAttributes(part),
      }),
    );
  }
  return builder.finish();
}
