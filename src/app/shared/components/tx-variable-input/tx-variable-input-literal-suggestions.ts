import type {
  DynamicVariableCatalogItem,
  DynamicVariableSuggestionsResult,
} from '@shared/dynamic-variables';
import { HTTP_COMPLETION_SUGGESTION_LIMIT } from '@shared/http/http-completion-limits';

import { filterPrefixSuggestions } from '../tx-suggest-input/filter-prefix-suggestions';

/**
 * Whole-field prefix suggestions (e.g. common HTTP header values for a known key).
 */
export function findLiteralValueSuggestions(
  value: string,
  catalog: readonly string[],
  limit = HTTP_COMPLETION_SUGGESTION_LIMIT,
): DynamicVariableSuggestionsResult | null {
  if (catalog.length === 0) {
    return null;
  }
  const items = filterPrefixSuggestions(value, catalog, limit);
  if (items.length === 0) {
    return null;
  }
  const catalogItems: DynamicVariableCatalogItem[] = items.map((insert, index) => ({
    id: `literal-${index}-${insert}`,
    label: insert,
    insert,
    detail: 'Suggested value',
  }));
  return {
    context: {
      replaceStart: 0,
      replaceEnd: value.length,
      prefix: value,
    },
    items: catalogItems,
  };
}
