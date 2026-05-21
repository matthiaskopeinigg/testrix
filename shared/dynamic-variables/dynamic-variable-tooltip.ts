import type { DynamicVariableCatalogItem } from './dynamic-variables';

/**
 * Tooltip copy for a highlighted `$` token or its `(...)` argument span.
 */
export function formatDynamicVariableTooltip(
  varId: string,
  catalog: readonly DynamicVariableCatalogItem[],
  part: 'token' | 'param' = 'token',
): string {
  const item = catalog.find((entry) => entry.id === varId);
  if (varId.startsWith('env:')) {
    const key = varId.slice(4);
    if (item) {
      return `${item.label} — ${item.detail}. Click to open in environment.`;
    }
    return `{{${key}}} — not in active environment. Click to search profiles.`;
  }
  if (!item) {
    return `$${varId} — Unknown variable`;
  }
  if (part === 'param') {
    return `${item.label} parameter — ${item.detail}`;
  }
  return `${item.label} — ${item.detail}`;
}

/** Short hint when the field is empty (lists catalog placeholders). */
export function formatDynamicVariablePlaceholderHint(
  catalog: readonly DynamicVariableCatalogItem[],
): string {
  const dollar = catalog.filter((entry) => entry.insert.startsWith('$')).map((entry) => entry.label);
  const env = catalog
    .filter((entry) => entry.insert.startsWith('{{'))
    .map((entry) => entry.label)
    .slice(0, 6);
  const parts: string[] = [];
  if (dollar.length) {
    parts.push(`$ (${dollar.join(', ')})`);
  }
  if (env.length) {
    const suffix = env.length < catalog.filter((e) => e.insert.startsWith('{{')).length ? '…' : '';
    parts.push(`{{ }} (${env.join(', ')}${suffix})`);
  }
  if (!parts.length) {
    return 'Type $ or {{name}} for dynamic or environment values.';
  }
  return `Use ${parts.join(' or ')}.`;
}
