/** Supported syntax modes for {@link TxCodeEditorComponent}. */
export type TxCodeEditorLanguage =
  | 'json'
  | 'xml'
  | 'graphql'
  | 'html'
  | 'plaintext'
  | 'js'
  | 'ts'
  | 'css'
  | 'scss';

export const TX_CODE_EDITOR_LANGUAGES: readonly TxCodeEditorLanguage[] = [
  'json',
  'xml',
  'graphql',
  'html',
  'plaintext',
  'js',
  'ts',
  'css',
  'scss',
];

const LANGUAGE_LABELS: Readonly<Record<TxCodeEditorLanguage, string>> = {
  json: 'JSON',
  xml: 'XML',
  graphql: 'GRAPHQL',
  html: 'HTML',
  plaintext: 'Text',
  js: 'JS',
  ts: 'TS',
  css: 'CSS',
  scss: 'SCSS',
};

/** Toolbar badge text for a language. */
export function txCodeEditorLanguageLabel(language: TxCodeEditorLanguage): string {
  return LANGUAGE_LABELS[language];
}

/** Languages that support debounced / toolbar pretty-print. */
export function txCodeEditorSupportsAutoFormat(language: TxCodeEditorLanguage): boolean {
  return language === 'json' || language === 'graphql' || language === 'xml' || language === 'html';
}
