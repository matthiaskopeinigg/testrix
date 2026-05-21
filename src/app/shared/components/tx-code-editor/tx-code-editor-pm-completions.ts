import type { TxCodeEditorCompletionItem } from './tx-code-editor-completion';

/**
 * Postman-style `pm.*` script API suggestions (including `pm.variables` script cache).
 * Used for JavaScript pre-request / post-response editors.
 */
export const TX_CODE_EDITOR_PM_COMPLETIONS: readonly TxCodeEditorCompletionItem[] = [
  { label: 'pm.variables.get', insert: "pm.variables.get('')", detail: 'Script cache — read', caretOffsetFromEnd: 2 },
  { label: 'pm.variables.set', insert: "pm.variables.set('', '')", detail: 'Script cache — write', caretOffsetFromEnd: 4 },
  { label: 'pm.variables.has', insert: "pm.variables.has('')", detail: 'Script cache — exists', caretOffsetFromEnd: 2 },
  { label: 'pm.variables.unset', insert: "pm.variables.unset('')", detail: 'Script cache — remove', caretOffsetFromEnd: 2 },
  { label: 'pm.variables.clear', insert: 'pm.variables.clear()', detail: 'Script cache — clear all' },
  { label: 'pm.environment.get', insert: "pm.environment.get('')", detail: 'Active environment', caretOffsetFromEnd: 2 },
  { label: 'pm.environment.set', insert: "pm.environment.set('', '')", detail: 'Active environment', caretOffsetFromEnd: 4 },
  { label: 'pm.environment.has', insert: "pm.environment.has('')", detail: 'Active environment', caretOffsetFromEnd: 2 },
  { label: 'pm.environment.unset', insert: "pm.environment.unset('')", detail: 'Active environment', caretOffsetFromEnd: 2 },
  { label: 'pm.environment.clear', insert: 'pm.environment.clear()', detail: 'Active environment' },
  {
    label: 'pm.collectionVariables.get',
    insert: "pm.collectionVariables.get('')",
    detail: 'Collection variables',
    caretOffsetFromEnd: 2,
  },
  {
    label: 'pm.collectionVariables.set',
    insert: "pm.collectionVariables.set('', '')",
    detail: 'Collection variables',
    caretOffsetFromEnd: 4,
  },
  { label: 'pm.globals.get', insert: "pm.globals.get('')", detail: 'Globals', caretOffsetFromEnd: 2 },
  { label: 'pm.globals.set', insert: "pm.globals.set('', '')", detail: 'Globals', caretOffsetFromEnd: 4 },
  { label: 'pm.request.url', insert: 'pm.request.url', detail: 'Current request URL' },
  { label: 'pm.request.method', insert: 'pm.request.method', detail: 'HTTP method' },
  { label: 'pm.request.headers.add', insert: "pm.request.headers.add('', '')", detail: 'Request header', caretOffsetFromEnd: 4 },
  { label: 'pm.request.headers.upsert', insert: "pm.request.headers.upsert('', '')", detail: 'Request header', caretOffsetFromEnd: 4 },
  { label: 'pm.request.body.raw', insert: 'pm.request.body.raw', detail: 'Request body (raw)' },
  { label: 'pm.response.code', insert: 'pm.response.code', detail: 'Response status code' },
  { label: 'pm.response.json()', insert: 'pm.response.json()', detail: 'Parse response JSON' },
  { label: 'pm.response.text()', insert: 'pm.response.text()', detail: 'Response body text' },
  { label: 'pm.test', insert: "pm.test('', () => {})", detail: 'Assertion', caretOffsetFromEnd: 6 },
  { label: 'pm.expect', insert: 'pm.expect()', detail: 'Chai assertion', caretOffsetFromEnd: 1 },
  { label: 'console.log', insert: "console.log('')", detail: 'Log', caretOffsetFromEnd: 2 },
];

/** Common JavaScript control-flow snippets for scripts. */
export const TX_CODE_EDITOR_JS_SNIPPETS: readonly TxCodeEditorCompletionItem[] = [
  { label: 'const', insert: 'const ', detail: 'Declaration' },
  { label: 'let', insert: 'let ', detail: 'Declaration' },
  { label: 'if', insert: 'if () {\n  \n}', detail: 'Conditional', caretOffsetFromEnd: 4 },
  { label: 'try/catch', insert: 'try {\n  \n} catch (e) {\n  console.log(e);\n}', detail: 'Error handling', caretOffsetFromEnd: 28 },
  { label: 'async function', insert: 'async function () {\n  \n}', detail: 'Async', caretOffsetFromEnd: 2 },
];
