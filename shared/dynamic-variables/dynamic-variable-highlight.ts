import { DYNAMIC_VARIABLES, type DynamicVariableCatalogItem } from './dynamic-variables';

/** Matches `$name` and optional `($digits)` argument groups (same shape as the resolver). */
const HIGHLIGHT_PATTERN = /\$([a-zA-Z][a-zA-Z0-9]*)(\(\d*\))?/g;

/**
 * Produces HTML for the variable-input mirror layer. Plain text is escaped; tokens and
 * parenthetical parameters receive semantic spans with `data-var-id` for tooltips.
 */
export function highlightDynamicVariableTemplate(
  text: string,
  catalog: readonly DynamicVariableCatalogItem[] = DYNAMIC_VARIABLES,
): string {
  if (!text) {
    return '';
  }

  const knownIds = new Set(catalog.map((entry) => entry.id));
  let html = '';
  let lastIndex = 0;
  const pattern = new RegExp(HIGHLIGHT_PATTERN.source, 'g');

  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const index = match.index;
    html += escapeHtml(text.slice(lastIndex, index));

    const name = match[1] ?? '';
    const paramGroup = match[2];
    const tokenText = `$${name}`;
    const known = knownIds.has(name);

    html += `<span class="tx-var-token${known ? '' : ' tx-var-token--unknown'}" data-var-id="${escapeAttr(name)}" data-var-part="token">${escapeHtml(tokenText)}</span>`;
    if (paramGroup !== undefined) {
      html += `<span class="tx-var-param" data-var-id="${escapeAttr(name)}" data-var-part="param">${escapeHtml(paramGroup)}</span>`;
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
