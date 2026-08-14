/** Row shown in the JSON snippet completion panel (Ctrl+Space). */
export interface TxCodeEditorCompletionItem {
  label: string;
  insert: string;
  detail?: string;
  caretOffsetFromEnd?: number;
}

export const TX_CODE_EDITOR_JSON_SNIPPETS: readonly TxCodeEditorCompletionItem[] = [
  { label: 'true', insert: 'true', detail: 'Boolean' },
  { label: 'false', insert: 'false', detail: 'Boolean' },
  { label: 'null', insert: 'null', detail: 'Null' },
  { label: '{}', insert: '{}', detail: 'Empty object' },
  { label: '[]', insert: '[]', detail: 'Empty array' },
  { label: '""', insert: '""', detail: 'String', caretOffsetFromEnd: 1 },
  { label: '{ … }', insert: '{\n  \n}', detail: 'Indented object', caretOffsetFromEnd: 2 },
  { label: '[ … ]', insert: '[\n  \n]', detail: 'Indented array', caretOffsetFromEnd: 2 },
  { label: '"key"', insert: '"key"', detail: 'Property name', caretOffsetFromEnd: 1 },
  { label: ': ""', insert: ': ""', detail: 'String value', caretOffsetFromEnd: 1 },
  { label: ': {}', insert: ': {}', detail: 'Nested object' },
  { label: ': []', insert: ': []', detail: 'Nested array' },
];
