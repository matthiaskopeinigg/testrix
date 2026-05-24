import type { TxCodeEditorLanguage } from '@app/shared/components/tx-code-editor/tx-code-editor-language';

const BODY_LANGUAGE_LABELS: Readonly<Partial<Record<string, string>>> = {
  json: 'JSON',
  xml: 'XML',
  graphql: 'GraphQL',
  text: 'Text',
  'form-data': 'Form data',
  urlencoded: 'URL encoded',
  binary: 'Binary',
  none: 'Text',
};

const EDITOR_LANGUAGE_LABELS: Readonly<Record<TxCodeEditorLanguage, string>> = {
  json: 'JSON',
  xml: 'XML',
  graphql: 'GRAPHQL',
  html: 'HTML',
  plaintext: 'Text',
  js: 'JS',
  ts: 'TS',
  css: 'CSS',
  scss: 'SCSS',
  sql: 'SQL',
  redis: 'Redis',
};

const BODY_PLACEHOLDERS: Readonly<Partial<Record<string, string>>> = {
  json: '{\n  "name": "{{userName}}",\n  "id": "$uuid"\n}',
  text: 'Hello {{userName}} — request id $uuid',
  xml: '<payload user="{{userName}}"/>\n<note>$timestamp</note>',
  graphql: 'query {\n  user(id: "{{userId}}") {\n    id\n  }\n}',
  urlencoded: 'key={{value}}&other={{other}}',
  'form-data': 'field={{value}}&file=@/path/to/file',
  binary: 'Paste base64-encoded bytes',
};

/** Maps flow request / interceptor body type to code editor syntax mode. */
export function flowBodyEditorLanguage(
  bodyType: string | null | undefined,
): TxCodeEditorLanguage {
  switch (bodyType) {
    case 'json':
      return 'json';
    case 'xml':
      return 'xml';
    case 'graphql':
      return 'graphql';
    case 'text':
    case 'form-data':
    case 'urlencoded':
    case 'binary':
      return 'plaintext';
    default:
      return 'plaintext';
  }
}

/** @deprecated Use {@link flowBodyEditorLanguage}. */
export const interceptorBodyEditorLanguage = flowBodyEditorLanguage;

/** Toolbar badge for a flow body editor. */
export function flowBodyEditorLanguageLabel(bodyType: string | null | undefined): string {
  const custom = bodyType ? BODY_LANGUAGE_LABELS[bodyType] : undefined;
  if (custom) {
    return custom;
  }
  return EDITOR_LANGUAGE_LABELS[flowBodyEditorLanguage(bodyType)];
}

/** Placeholder shown in an empty flow body editor. */
export function flowBodyEditorPlaceholder(bodyType: string | null | undefined): string {
  return BODY_PLACEHOLDERS[bodyType ?? ''] ?? '';
}

/** Whether the flow body editor should render for the selected body type. */
export function flowBodyEditorVisible(bodyType: string | null | undefined): boolean {
  return !!bodyType && bodyType !== 'none';
}
