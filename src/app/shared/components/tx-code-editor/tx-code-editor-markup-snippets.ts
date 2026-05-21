import type { TxCodeEditorCompletionItem } from './tx-code-editor-completion';

export const TX_CODE_EDITOR_XML_SNIPPETS: readonly TxCodeEditorCompletionItem[] = [
  {
    label: '<?xml … ?>',
    insert: '<?xml version="1.0" encoding="UTF-8"?>\n',
    detail: 'XML declaration',
  },
  {
    label: '<root></root>',
    insert: '<root></root>',
    detail: 'Root element',
    caretOffsetFromEnd: 7,
  },
  {
    label: '<element/>',
    insert: '<element/>',
    detail: 'Empty element',
  },
  {
    label: '<![CDATA[ ]]>',
    insert: '<![CDATA[]]>',
    detail: 'CDATA section',
    caretOffsetFromEnd: 3,
  },
  {
    label: '<!-- -->',
    insert: '<!-- -->',
    detail: 'Comment',
    caretOffsetFromEnd: 4,
  },
];

export const TX_CODE_EDITOR_HTML_SNIPPETS: readonly TxCodeEditorCompletionItem[] = [
  {
    label: '<!DOCTYPE html>',
    insert: '<!DOCTYPE html>\n',
    detail: 'Document type',
  },
  {
    label: '<html></html>',
    insert: '<html></html>',
    detail: 'Document root',
    caretOffsetFromEnd: 7,
  },
  {
    label: '<head></head>',
    insert: '<head></head>',
    detail: 'Head',
    caretOffsetFromEnd: 7,
  },
  {
    label: '<body></body>',
    insert: '<body></body>',
    detail: 'Body',
    caretOffsetFromEnd: 7,
  },
  {
    label: '<div></div>',
    insert: '<div></div>',
    detail: 'Div',
    caretOffsetFromEnd: 6,
  },
  {
    label: '<span></span>',
    insert: '<span></span>',
    detail: 'Span',
    caretOffsetFromEnd: 7,
  },
  {
    label: '<p></p>',
    insert: '<p></p>',
    detail: 'Paragraph',
    caretOffsetFromEnd: 4,
  },
  {
    label: '<a href="">',
    insert: '<a href=""></a>',
    detail: 'Link',
    caretOffsetFromEnd: 6,
  },
  {
    label: '<img />',
    insert: '<img />',
    detail: 'Image',
  },
  {
    label: '<script></script>',
    insert: '<script></script>',
    detail: 'Script',
    caretOffsetFromEnd: 9,
  },
  {
    label: '<!-- -->',
    insert: '<!-- -->',
    detail: 'Comment',
    caretOffsetFromEnd: 4,
  },
];
