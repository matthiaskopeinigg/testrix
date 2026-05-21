import type { DynamicVariableCatalogItem } from './dynamic-variables';
import { DYNAMIC_VARIABLES } from './dynamic-variables';

/** Matches `$name` with optional `($digits)` or `{{name}}` placeholders. */
const TEMPLATE_HIGHLIGHT_PATTERN = /\$([a-zA-Z][a-zA-Z0-9]*)(\(\d*\))?|\{\{([\w.-]+)\}\}/g;

/**
 * HTML for variable-input mirrors: `$` tokens and `{{environment}}` placeholders.
 */
export function highlightTemplateVariables(
  text: string,
  catalog: readonly DynamicVariableCatalogItem[] = DYNAMIC_VARIABLES,
): string {
  if (!text) {
    return '';
  }

  const knownDollarIds = new Set(
    catalog.filter((entry) => entry.insert.startsWith('$')).map((entry) => entry.id),
  );
  const knownEnvKeys = new Set(
    catalog
      .filter((entry) => entry.insert.startsWith('{{') && entry.insert.endsWith('}}'))
      .map((entry) => entry.insert.slice(2, -2)),
  );

  let html = '';
  let lastIndex = 0;
  const pattern = new RegExp(TEMPLATE_HIGHLIGHT_PATTERN.source, 'g');

  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const index = match.index;
    html += escapeHtml(text.slice(lastIndex, index));

    const dollarName = match[1];
    const paramGroup = match[2];
    const braceKey = match[3];

    if (dollarName !== undefined) {
      const tokenText = `$${dollarName}`;
      const known = knownDollarIds.has(dollarName);
      html += `<span class="tx-var-token${known ? '' : ' tx-var-token--unknown'}" data-var-id="${escapeAttr(dollarName)}" data-var-part="token">${escapeHtml(tokenText)}</span>`;
      if (paramGroup !== undefined) {
        html += `<span class="tx-var-param" data-var-id="${escapeAttr(dollarName)}" data-var-part="param">${escapeHtml(paramGroup)}</span>`;
      }
    } else if (braceKey !== undefined) {
      const tokenText = `{{${braceKey}}}`;
      const known = knownEnvKeys.has(braceKey);
      const varId = `env:${braceKey}`;
      html += `<span class="tx-var-token tx-var-token--env${known ? '' : ' tx-var-token--unknown'}" data-var-id="${escapeAttr(varId)}" data-var-part="token">${escapeHtml(tokenText)}</span>`;
    }

    lastIndex = index + match[0].length;
  }

  html += escapeHtml(text.slice(lastIndex));
  return html;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll("'", '&#39;');
}
