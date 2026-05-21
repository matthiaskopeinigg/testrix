import type { CollectionFolderAuth } from '../config/collection-folder-settings.schema';
import type { CollectionRequestBody } from '../config/collection-request-settings.schema';
import type { HttpMethodId } from '../config/http-settings.schema';
import type { ResolvedRequestHeaderRow } from '../config/resolve-collection-request-headers';
import { applyCollectionRequestAuth } from '../config/resolve-collection-request-auth';
import { buildRequestDisplayUrl } from '../config/request-url';
import type { HttpKeyValueRow } from '../config/http-settings.schema';
import { bodyToSnippetBody } from './snippet-body';

export const REQUEST_CODE_SNIPPET_FORMAT_IDS = [
  'curl',
  'python',
  'javascript',
  'nodejs',
  'go',
  'csharp',
] as const;

export type RequestCodeSnippetFormatId = (typeof REQUEST_CODE_SNIPPET_FORMAT_IDS)[number];

export type RequestCodeSnippetEditorLanguage = 'text' | 'js';

export interface RequestCodeSnippetFormat {
  readonly id: RequestCodeSnippetFormatId;
  readonly label: string;
  readonly editorLanguage: RequestCodeSnippetEditorLanguage;
}

export const REQUEST_CODE_SNIPPET_FORMATS: readonly RequestCodeSnippetFormat[] = [
  { id: 'curl', label: 'cURL', editorLanguage: 'text' },
  { id: 'python', label: 'Python — Requests', editorLanguage: 'text' },
  { id: 'javascript', label: 'JavaScript — Fetch', editorLanguage: 'js' },
  { id: 'nodejs', label: 'Node.js — Fetch', editorLanguage: 'js' },
  { id: 'go', label: 'Go — net/http', editorLanguage: 'text' },
  { id: 'csharp', label: 'C# — HttpClient', editorLanguage: 'text' },
];

export type { RequestCodeSnippetBody } from './snippet-body';
import type { RequestCodeSnippetBody } from './snippet-body';

export interface RequestCodeSnippetInput {
  readonly method: HttpMethodId;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: RequestCodeSnippetBody;
}

export function buildRequestCodeSnippetInput(params: {
  readonly method: HttpMethodId;
  readonly urlPath: string;
  readonly queryParams: readonly HttpKeyValueRow[];
  readonly resolvedHeaders: readonly ResolvedRequestHeaderRow[];
  readonly body: CollectionRequestBody;
  readonly auth: CollectionFolderAuth;
  readonly contentTypeHint: string | null;
}): RequestCodeSnippetInput {
  let url = buildRequestDisplayUrl(params.urlPath, params.queryParams);
  const headers: Record<string, string> = {};

  for (const row of params.resolvedHeaders) {
    if (!row.enabled) {
      continue;
    }
    const key = row.key.trim();
    if (key) {
      headers[key] = row.value;
    }
  }

  url = applyCollectionRequestAuth(params.auth, headers, url);

  const hint = params.contentTypeHint?.trim();
  if (hint && !headerKeyExists(headers, 'content-type')) {
    headers['Content-Type'] = hint;
  }

  return {
    method: params.method,
    url,
    headers,
    body: bodyToSnippetBody(params.body),
  };
}

export { bodyToSnippetBody } from './snippet-body';

export function generateRequestCodeSnippet(
  input: RequestCodeSnippetInput,
  formatId: RequestCodeSnippetFormatId,
): string {
  switch (formatId) {
    case 'curl':
      return generateCurl(input);
    case 'python':
      return generatePython(input);
    case 'javascript':
      return generateJavaScript(input, false);
    case 'nodejs':
      return generateJavaScript(input, true);
    case 'go':
      return generateGo(input);
    case 'csharp':
      return generateCsharp(input);
    default:
      return '';
  }
}

function headerKeyExists(headers: Readonly<Record<string, string>>, name: string): boolean {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === lower);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function jsonString(value: string): string {
  return JSON.stringify(value);
}

function generateCurl(input: RequestCodeSnippetInput): string {
  const lines: string[] = ['curl'];
  const method = input.method.toUpperCase();

  if (method !== 'GET') {
    lines.push(`-X ${method}`);
  }

  lines.push(shellQuote(input.url));

  for (const [key, value] of Object.entries(input.headers)) {
    lines.push(`-H ${shellQuote(`${key}: ${value}`)}`);
  }

  appendCurlBody(lines, input.body);
  return lines.join(' \\\n  ');
}

function appendCurlBody(lines: string[], body: RequestCodeSnippetBody): void {
  switch (body.kind) {
    case 'none':
      return;
    case 'text':
      lines.push(`--data-raw ${shellQuote(body.content)}`);
      return;
    case 'urlencoded': {
      const encoded = new URLSearchParams();
      for (const pair of body.pairs) {
        encoded.set(pair.key, pair.value);
      }
      lines.push(`--data-raw ${shellQuote(encoded.toString())}`);
      return;
    }
    case 'form-data':
      for (const field of body.fields) {
        if (field.fileName) {
          lines.push(`-F ${shellQuote(`${field.key}=@${field.fileName}`)}`);
        } else {
          lines.push(`-F ${shellQuote(`${field.key}=${field.value ?? ''}`)}`);
        }
      }
      return;
    case 'unsupported':
      lines.push(`# ${body.message}`);
      return;
    default:
      return;
  }
}

function generatePython(input: RequestCodeSnippetInput): string {
  const lines: string[] = ['import requests', ''];
  const headerEntries = Object.entries(input.headers);
  if (headerEntries.length > 0) {
    lines.push('headers = {');
    for (const [key, value] of headerEntries) {
      lines.push(`    ${jsonString(key)}: ${jsonString(value)},`);
    }
    lines.push('}', '');
  }

  const args: string[] = [jsonString(input.url)];
  if (headerEntries.length > 0) {
    args.push('headers=headers');
  }

  const bodyArg = pythonBodyArg(input.body);
  if (bodyArg) {
    args.push(bodyArg);
  }

  const call = `requests.${input.method.toLowerCase()}(${args.join(', ')})`;
  lines.push(`response = ${call}`, 'print(response.status_code)', 'print(response.text)');
  return lines.join('\n');
}

function pythonBodyArg(body: RequestCodeSnippetBody): string | null {
  switch (body.kind) {
    case 'none':
      return null;
    case 'text':
      return `data=${jsonString(body.content)}`;
    case 'urlencoded':
      return `data={${body.pairs.map((p) => `${jsonString(p.key)}: ${jsonString(p.value)}`).join(', ')}}`;
    case 'form-data':
      return 'files={/* TODO: attach files */}';
    case 'unsupported':
      return null;
    default:
      return null;
  }
}

function generateJavaScript(input: RequestCodeSnippetInput, node: boolean): string {
  const lines: string[] = node ? [] : [];
  const headerObj = Object.entries(input.headers);
  const headersLiteral =
    headerObj.length === 0
      ? '{}'
      : `{\n${headerObj.map(([k, v]) => `    ${jsonString(k)}: ${jsonString(v)},`).join('\n')}\n  }`;

  const options: string[] = [`method: ${jsonString(input.method.toUpperCase())}`, `headers: ${headersLiteral}`];
  const bodyLine = javascriptBodyOption(input.body);
  if (bodyLine) {
    options.push(bodyLine);
  }

  if (node) {
    lines.push("const fetch = globalThis.fetch;");
    lines.push('');
  }

  lines.push(
    `const response = await fetch(${jsonString(input.url)}, {`,
    `  ${options.join(',\n  ')},`,
    '});',
    '',
    'const text = await response.text();',
    'console.log(response.status, text);',
  );
  return lines.join('\n');
}

function javascriptBodyOption(body: RequestCodeSnippetBody): string | null {
  switch (body.kind) {
    case 'none':
      return null;
    case 'text':
      return `body: ${jsonString(body.content)}`;
    case 'urlencoded': {
      const encoded = new URLSearchParams();
      for (const pair of body.pairs) {
        encoded.set(pair.key, pair.value);
      }
      return `body: ${jsonString(encoded.toString())}`;
    }
    case 'form-data':
      return 'body: new FormData() /* TODO: append fields */';
    case 'unsupported':
      return null;
    default:
      return null;
  }
}

function generateGo(input: RequestCodeSnippetInput): string {
  const lines: string[] = [
    'package main',
    '',
    'import (',
    '    "fmt"',
    '    "io"',
    '    "net/http"',
    '    "strings"',
    ')',
    '',
    'func main() {',
    `    req, err := http.NewRequest("${input.method.toUpperCase()}", ${jsonString(input.url)}, nil)`,
    '    if err != nil {',
    '        panic(err)',
    '    }',
  ];

  for (const [key, value] of Object.entries(input.headers)) {
    lines.push(`    req.Header.Set(${jsonString(key)}, ${jsonString(value)})`);
  }

  const body = goBodyLines(input.body);
  lines.push(...body);
  lines.push(
    '    resp, err := http.DefaultClient.Do(req)',
    '    if err != nil {',
    '        panic(err)',
    '    }',
    '    defer resp.Body.Close()',
    '    out, _ := io.ReadAll(resp.Body)',
    '    fmt.Println(resp.Status, string(out))',
    '}',
  );
  return lines.join('\n');
}

function goBodyLines(body: RequestCodeSnippetBody): string[] {
  switch (body.kind) {
    case 'text':
      return [
        `    req.Body = io.NopCloser(strings.NewReader(${jsonString(body.content)}))`,
      ];
    case 'urlencoded': {
      const encoded = new URLSearchParams();
      for (const pair of body.pairs) {
        encoded.set(pair.key, pair.value);
      }
      return [
        `    req.Body = io.NopCloser(strings.NewReader(${jsonString(encoded.toString())}))`,
      ];
    }
    case 'unsupported':
      return [`    // ${body.message}`];
    default:
      return [];
  }
}

function generateCsharp(input: RequestCodeSnippetInput): string {
  const lines: string[] = [
    'using var client = new HttpClient();',
    `using var request = new HttpRequestMessage(HttpMethod.${toPascalHttpMethod(input.method)}, ${jsonString(input.url)});`,
  ];

  for (const [key, value] of Object.entries(input.headers)) {
    lines.push(`request.Headers.TryAddWithoutValidation(${jsonString(key)}, ${jsonString(value)});`);
  }

  const body = csharpBody(input.body);
  if (body) {
    lines.push(body);
  }

  lines.push(
    'using var response = await client.SendAsync(request);',
    'var text = await response.Content.ReadAsStringAsync();',
    'Console.WriteLine($"{(int)response.StatusCode} {text}");',
  );
  return lines.join('\n');
}

function csharpBody(body: RequestCodeSnippetBody): string | null {
  switch (body.kind) {
    case 'text':
      return `request.Content = new StringContent(${jsonString(body.content)}, System.Text.Encoding.UTF8, ${jsonString(body.contentType)});`;
    case 'urlencoded': {
      const encoded = new URLSearchParams();
      for (const pair of body.pairs) {
        encoded.set(pair.key, pair.value);
      }
      return `request.Content = new StringContent(${jsonString(encoded.toString())}, System.Text.Encoding.UTF8, "application/x-www-form-urlencoded");`;
    }
    case 'unsupported':
      return `// ${body.message}`;
    default:
      return null;
  }
}

function toPascalHttpMethod(method: HttpMethodId): string {
  const upper = method.toUpperCase();
  if (upper === 'DELETE') {
    return 'Delete';
  }
  return upper.charAt(0) + upper.slice(1).toLowerCase();
}
