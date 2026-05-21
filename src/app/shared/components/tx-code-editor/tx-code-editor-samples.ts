import type { TxCodeEditorLanguage } from './tx-code-editor-language';

/** Sample payloads for Design System and Story-style demos. */
export const TX_CODE_EDITOR_SAMPLES: Readonly<Record<TxCodeEditorLanguage, string>> = {
  json: `{
  "name": "Testrix",
  "version": 1,
  "features": ["collections", "environments"]
}`,
  xml: `<?xml version="1.0" encoding="UTF-8"?>
<project>
  <name>Testrix</name>
  <version>1</version>
</project>`,
  graphql: `query ListUsers($limit: Int!) {
  users(limit: $limit) {
    id
    email
  }
}`,
  plaintext: 'Hello {{userName}} — request id $uuid',
  html: `<!DOCTYPE html>
<html lang="en">
  <head>
    <title>Testrix</title>
  </head>
  <body>
    <p>Hello</p>
  </body>
</html>`,
  js: `// Pre-request script
const token = pm.environment.get('token');
console.log('token', token);`,
  ts: `export interface User {
  id: string;
  email: string;
}

export function greet(user: User): string {
  return \`Hello, \${user.email}\`;
}`,
  css: `.tx-shell {
  display: flex;
  min-height: 100%;
  background: var(--tx-surface-0);
  color: var(--tx-text-0);
}`,
  scss: `@use 'tokens';

.tx-button {
  &--primary {
    color: var(--tx-primary);
  }
}`,
};
