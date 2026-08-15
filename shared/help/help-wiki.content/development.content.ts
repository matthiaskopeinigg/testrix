import { wikiSection } from '../help-wiki.builders';
import type { HelpWikiSection } from '../help-wiki.schema';

export const HELP_WIKI_DEVELOPMENT_SECTIONS: readonly HelpWikiSection[] = [
  wikiSection({
    id: 'dev-uuid-generator',
    groupId: 'development',
    label: 'UUID Generator',
    icon: 'hash',
    title: 'UUID Generator',
    description: 'Bulk UUID v4, v7, ULID, and NanoID generation.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Generate one or many UUID v4 values. Toggle uppercase and strip hyphens; copy individual lines or the full output.',
      },
    ],
  }),
  wikiSection({
    id: 'dev-code-editor',
    groupId: 'development',
    label: 'Code Editor',
    icon: 'code',
    title: 'Code Editor',
    description: 'Multi-language syntax editor.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Edit JSON, XML, GraphQL, SQL, JavaScript, TypeScript, and other languages with syntax highlighting, format, and document stats.',
      },
    ],
  }),
  wikiSection({
    id: 'dev-base64',
    groupId: 'development',
    label: 'Base64',
    icon: 'fileText',
    title: 'Base64 Encode / Decode',
    description: 'Live encode and decode panes.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Switch between encode and decode modes, URL-safe alphabet, and swap panes to move output back to input.',
      },
    ],
  }),
  wikiSection({
    id: 'dev-jwt',
    groupId: 'development',
    label: 'JWT',
    icon: 'lock',
    title: 'JWT Toolkit',
    description: 'Generate, decode, and validate JWTs with signing profiles.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Generate tokens with claim builders and named signing profiles (secret files or inline secrets). Decode inspects header and payload. Validate checks signature and claims via HS, RS, or ES algorithms.',
      },
      {
        type: 'note',
        title: 'Secrets',
        text: 'Inline signing secrets stay in memory only. Profiles may store secret file paths or environment variable names — never the secret material itself.',
      },
    ],
  }),
  wikiSection({
    id: 'dev-cron',
    groupId: 'development',
    label: 'Cron',
    icon: 'clock',
    title: 'Cron Expression Builder',
    description: 'Presets and next run times.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Edit cron fields or pick presets; human-readable description and upcoming run times update live. Use in monitor… opens Testing → Monitors with the current expression.',
      },
    ],
  }),
  wikiSection({
    id: 'dev-regex',
    groupId: 'development',
    label: 'Regex',
    icon: 'search',
    title: 'Regex Builder / Tester',
    description: 'Flags, groups, replace preview, cheatsheet.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Test regular expressions against sample text with flag chips, capture group highlights, replace preview, and a built-in cheatsheet.',
      },
    ],
  }),
  wikiSection({
    id: 'dev-url',
    groupId: 'development',
    label: 'URL',
    icon: 'link',
    title: 'URL Encode / Decode',
    description: 'Encode, decode, or parse URLs.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Encode or decode full URLs or components only; parse mode splits scheme, host, path, and query.',
      },
    ],
  }),
  wikiSection({
    id: 'dev-bcrypt',
    groupId: 'development',
    label: 'Bcrypt',
    icon: 'shield',
    title: 'Bcrypt Generator / Validator',
    description: 'Hash and verify passwords.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Generate bcrypt hashes with configurable cost rounds or verify a plaintext against an existing hash.',
      },
      {
        type: 'note',
        text: 'Plaintext passwords are never persisted — only kept in memory for the session.',
      },
    ],
  }),
  wikiSection({
    id: 'dev-openapi',
    groupId: 'development',
    label: 'OpenAPI',
    icon: 'api',
    title: 'OpenAPI Editor / Viewer',
    description: 'JSON/YAML OpenAPI documents.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Edit OpenAPI 3 specs in JSON or YAML with outline navigation and validation feedback.',
      },
    ],
  }),
  wikiSection({
    id: 'dev-hash',
    groupId: 'development',
    label: 'Hash / HMAC',
    icon: 'hash',
    title: 'Hash / HMAC',
    description: 'MD5, SHA family, and HMAC-SHA256.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Hash text with MD5 or SHA algorithms. HMAC-SHA256 uses a key kept in memory for the session.',
      },
    ],
  }),
  wikiSection({
    id: 'dev-jsonpath',
    groupId: 'development',
    label: 'JSONPath',
    icon: 'search',
    title: 'JSONPath Tester',
    description: 'Evaluate JSONPath against a JSON document.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Paste JSON and a path such as $.user.name or $.items[0].id. The same extractor is used when capturing a response value into an environment variable.',
      },
    ],
  }),
  wikiSection({
    id: 'dev-cert-inspector',
    groupId: 'development',
    label: 'Certificates',
    icon: 'shield',
    title: 'Certificate Inspector',
    description: 'Inspect PEM certificates, CSRs, and keys.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Paste PEM blocks to see type, DER size, and SHA-256 fingerprint. Private key material is not decoded beyond the PEM envelope.',
      },
    ],
  }),
  wikiSection({
    id: 'dev-request-diff',
    groupId: 'development',
    label: 'Request Diff',
    icon: 'layers',
    title: 'Request / Response Diff',
    description: 'Side-by-side text comparison.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Compare two payloads side by side using the same line-diff engine as HTTP response diffs.',
      },
    ],
  }),
];
