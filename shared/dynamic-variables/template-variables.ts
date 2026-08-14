import {
  DYNAMIC_VARIABLES,
  findDynamicVariableSuggestions,
  resolveDynamicVariables,
  type DynamicVariableCatalogItem,
  type DynamicVariableResolveContext,
  type DynamicVariableSuggestionsResult,
} from './dynamic-variables';
import { adjustBraceTemplateReplaceEnd } from './template-variable-insert';

const BRACE_TOKEN_PATTERN = /\{\{([\w.-]+)\}\}/g;
const BRACE_ACTIVE_PATTERN = /^[\w.-]*$/;

export interface TemplateVariableResolveContext extends DynamicVariableResolveContext {
  readonly environment?: Readonly<Record<string, string>>;
}

/**
 * Suggests `$` dynamic variables or `{{environment}}` placeholders at the caret.
 */
export function findTemplateVariableSuggestions(
  text: string,
  caretIndex: number,
  catalog: readonly DynamicVariableCatalogItem[] = DYNAMIC_VARIABLES,
): DynamicVariableSuggestionsResult | null {
  const brace = findBraceVariableSuggestions(text, caretIndex, catalog);
  if (brace) {
    return brace;
  }
  return findDynamicVariableSuggestions(text, caretIndex, catalog);
}

function findBraceVariableSuggestions(
  text: string,
  caretIndex: number,
  catalog: readonly DynamicVariableCatalogItem[],
): DynamicVariableSuggestionsResult | null {
  const caret = clampCaret(text, caretIndex);
  const before = text.slice(0, caret);
  const open = before.lastIndexOf('{{');
  if (open < 0) {
    return null;
  }

  const segment = before.slice(open + 2);
  if (segment.includes('}}') || !BRACE_ACTIVE_PATTERN.test(segment)) {
    return null;
  }

  const prefixLower = segment.toLowerCase();
  const items = catalog.filter((item) => {
    if (!item.insert.startsWith('{{') || !item.insert.endsWith('}}')) {
      return false;
    }
    const key = item.insert.slice(2, -2).toLowerCase();
    return !prefixLower || key.startsWith(prefixLower);
  });

  if (items.length === 0 && prefixLower) {
    return null;
  }

  const replaceEnd = adjustBraceTemplateReplaceEnd(text, open, caret, segment);

  return {
    context: {
      replaceStart: open,
      replaceEnd,
      prefix: segment,
    },
    items,
  };
}

/**
 * Resolves `{{environment}}` placeholders then known `$` dynamic variables.
 */
export function resolveTemplateVariables(
  template: string,
  ctx: TemplateVariableResolveContext = {},
): string {
  const env = ctx.environment ?? {};
  const withEnv = template.replace(BRACE_TOKEN_PATTERN, (match, key: string) => {
    const value = env[key];
    return value !== undefined ? value : match;
  });
  return resolveDynamicVariables(withEnv, ctx);
}

function clampCaret(text: string, caretIndex: number): number {
  return Math.max(0, Math.min(caretIndex, text.length));
}
