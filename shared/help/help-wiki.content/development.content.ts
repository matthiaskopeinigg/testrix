import { wikiSection } from '../help-wiki.builders';
import type { HelpWikiSection } from '../help-wiki.schema';

export const HELP_WIKI_DEVELOPMENT_SECTIONS: readonly HelpWikiSection[] = [
  wikiSection({
    id: 'dev-uuid-generator',
    groupId: 'development',
    label: 'UUID Generator',
    icon: 'hash',
    title: 'UUID Generator',
    description: 'Bulk UUID v4 generation.',
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
    title: 'JWT Decode / Encode',
    description: 'Decode, sign HS256, and verify tokens.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Paste a token to decode header and payload, or build/sign JWTs with HS256. Verify mode checks signature against a secret.',
      },
      {
        type: 'note',
        title: 'Secrets',
        text: 'Signing secrets stay in memory only — they are not written to disk.',
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
        text: 'Edit cron fields or pick presets; human-readable description and upcoming run times update live.',
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
];
