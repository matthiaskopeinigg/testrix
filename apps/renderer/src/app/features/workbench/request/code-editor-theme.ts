import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--tx-syntax-keyword)' },
  { tag: tags.bool, color: 'var(--tx-syntax-keyword)' },
  { tag: tags.null, color: 'var(--tx-syntax-comment)' },
  { tag: tags.string, color: 'var(--tx-syntax-string)' },
  { tag: tags.number, color: 'var(--tx-syntax-number)' },
  { tag: tags.comment, color: 'var(--tx-syntax-comment)', fontStyle: 'italic' },
  { tag: tags.propertyName, color: 'var(--tx-syntax-property)' },
  { tag: tags.tagName, color: 'var(--tx-syntax-tag)' },
  { tag: tags.attributeName, color: 'var(--tx-syntax-attribute)' },
  { tag: tags.attributeValue, color: 'var(--tx-syntax-string)' },
  { tag: tags.variableName, color: 'var(--tx-syntax-variable)' },
  { tag: tags.operator, color: 'var(--tx-text-muted)' },
  { tag: tags.punctuation, color: 'var(--tx-text-faint)' },
  { tag: tags.invalid, color: 'var(--tx-danger)' },
  { tag: tags.className, color: 'var(--tx-syntax-tag)' },
  { tag: tags.typeName, color: 'var(--tx-syntax-tag)' },
  { tag: tags.angleBracket, color: 'var(--tx-text-faint)' },
]);

const chrome = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'transparent',
    color: 'var(--tx-text-primary)',
    fontSize: '12px',
  },
  '.cm-scroller': {
    fontFamily: 'var(--tx-font-mono)',
    lineHeight: '1.55',
    overflow: 'auto',
  },
  '.cm-content': {
    caretColor: 'var(--tx-text-primary)',
    padding: '12px 14px 16px',
  },
  '.cm-gutters': {
    backgroundColor: 'color-mix(in srgb, var(--tx-text-primary) 2.5%, transparent)',
    color: 'var(--tx-text-faint)',
    border: 'none',
    borderRight: '1px solid var(--tx-border-subtle)',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in srgb, var(--tx-text-primary) 4%, transparent)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
    color: 'var(--tx-text-muted)',
  },
  '.cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    backgroundColor: 'color-mix(in srgb, var(--tx-accent) 28%, transparent) !important',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--tx-text-primary)',
  },
  '.cm-matchingBracket': {
    backgroundColor: 'color-mix(in srgb, var(--tx-accent) 18%, transparent)',
  },
  '.cm-tooltip': {
    border: '1px solid var(--tx-border-subtle)',
    borderRadius: '12px',
    backgroundColor: 'var(--tx-bg-overlay)',
    color: 'var(--tx-text-primary)',
    boxShadow: 'var(--tx-shadow-2)',
  },
  '.cm-tooltip-autocomplete ul': {
    fontFamily: 'var(--tx-font-mono)',
    fontSize: '12px',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'color-mix(in srgb, var(--tx-accent) 14%, transparent)',
    color: 'var(--tx-text-primary)',
  },
  '.cm-diagnostic-error': {
    borderBottom: '1px dashed var(--tx-danger)',
  },
  '.cm-foldGutter .cm-gutterElement': {
    cursor: 'pointer',
  },
  '.cm-searchMatch': {
    backgroundColor: 'color-mix(in srgb, var(--tx-accent) 22%, transparent)',
  },
  '.cm-searchMatch-selected': {
    backgroundColor: 'color-mix(in srgb, var(--tx-accent) 38%, transparent)',
  },
  '.cm-panels': {
    backgroundColor: 'var(--tx-bg-chrome)',
    color: 'var(--tx-text-primary)',
    borderTop: '1px solid var(--tx-border-subtle)',
  },
  '.cm-textfield': {
    backgroundColor: 'transparent',
    color: 'var(--tx-text-primary)',
    border: '1px solid var(--tx-border-subtle)',
  },
  '.cm-button': {
    backgroundColor: 'transparent',
    color: 'var(--tx-text-primary)',
    border: '1px solid var(--tx-border-subtle)',
  },
  '.tx-code-ph': {
    borderRadius: '3px',
    backgroundColor: 'color-mix(in srgb, var(--tx-accent) 16%, transparent)',
    color: 'var(--tx-accent) !important',
  },
  '.tx-code-ph.is-var': {
    backgroundColor: 'color-mix(in srgb, var(--tx-accent) 12%, transparent)',
  },
  '.tx-code-ph.is-unknown': {
    backgroundColor: 'color-mix(in srgb, var(--tx-accent) 8%, transparent)',
    color: 'var(--tx-accent) !important',
    opacity: '0.78',
  },
  '.tx-code-ph.is-link': {
    cursor: 'pointer',
  },
});

export const codeEditorTheme: Extension = [chrome, syntaxHighlighting(highlight)];
