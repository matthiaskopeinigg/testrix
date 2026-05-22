import type { TxCodeEditorLanguage } from '@app/shared/components/tx-code-editor/tx-code-editor-language';

/** Maps interceptor replace-body type to code editor syntax mode. */
export function interceptorBodyEditorLanguage(
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
