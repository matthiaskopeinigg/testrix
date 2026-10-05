import {
  requestConfigOf,
  type CollectionKvRow,
  type CollectionNode,
  type CollectionRequestConfig,
  type EnvironmentNode,
} from '@testrix/contracts';

import type { WorkbenchStore } from '../workbench/workbench.store';

const MUSTACHE_VAR_RE = /\{\{\s*([^{}\s}]+)\s*\}\}/g;

function collectFromText(text: string, out: Set<string>): void {
  for (const match of text.matchAll(MUSTACHE_VAR_RE)) {
    const name = match[1]?.trim();
    if (name)
      out.add(name);
  }
}

function collectFromRows(rows: readonly CollectionKvRow[], out: Set<string>): void {
  for (const row of rows) {
    collectFromText(row.key, out);
    collectFromText(row.value, out);
    collectFromText(row.description ?? '', out);
  }
}

function collectFromRequestConfig(config: CollectionRequestConfig, out: Set<string>): void {
  collectFromText(config.url, out);
  collectFromRows(config.pathParams, out);
  collectFromRows(config.queryParams, out);
  collectFromRows(config.headers, out);
  collectFromText(config.body.text, out);
  collectFromText(config.body.graphql.query, out);
  collectFromText(config.body.graphql.variables, out);
  for (const row of config.body.formRows)
    collectFromText(row.value, out);
  collectFromText(config.auth.token, out);
  collectFromText(config.auth.username, out);
  collectFromText(config.auth.password, out);
  collectFromText(config.auth.apiKey, out);
  collectFromText(config.auth.apiKeyHeader, out);
}

function collectFromTabUrl(url: string, out: Set<string>): void {
  collectFromText(url, out);
}

function collectExistingKeys(nodes: readonly EnvironmentNode[], out: Set<string>): void {
  for (const node of nodes) {
    if (node.kind === 'variable') {
      if (node.key.trim())
        out.add(node.key.trim().toLowerCase());
      continue;
    }
    collectExistingKeys(node.children, out);
  }
}

/** Variable names referenced in open HTTP request tabs. */
export function collectOpenRequestVariableNames(input: {
  readonly workbench: WorkbenchStore;
  readonly nodeById: (id: string) => CollectionNode | null;
}): readonly string[] {
  const names = new Set<string>();
  for (const group of input.workbench.groups()) {
    for (const tab of group.tabs) {
      if (tab.kind !== 'http')
        continue;
      collectFromTabUrl(tab.url, names);
      const seed = tab.replaySeed;
      if (seed) {
        collectFromRows(
          seed.headers.map((row, index) => ({
            id: `seed-h-${index}`,
            key: row.key,
            value: row.value,
            enabled: true,
            description: '',
          })),
          names,
        );
        collectFromText(seed.body, names);
      }
      const node = input.nodeById(tab.nodeId);
      if (node?.kind === 'http')
        collectFromRequestConfig(requestConfigOf(node), names);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function missingEnvironmentVariableNames(
  variables: readonly EnvironmentNode[],
  referenced: readonly string[],
): readonly string[] {
  const existing = new Set<string>();
  collectExistingKeys(variables, existing);
  const missing: string[] = [];
  for (const name of referenced) {
    const key = name.trim();
    if (!key)
      continue;
    if (existing.has(key.toLowerCase()))
      continue;
    if (missing.some((item) => item.toLowerCase() === key.toLowerCase()))
      continue;
    missing.push(key);
  }
  return missing;
}
