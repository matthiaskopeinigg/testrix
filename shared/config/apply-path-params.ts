import type { CollectionRequestPathParam } from './collection-request-settings.schema';
import { resolveTemplateVariables } from '../dynamic-variables/template-variables';

const PATH_PARAM_PATTERN = /:([A-Za-z0-9_]+)/g;

/**
 * Substitutes `:param` segments then resolves `{{env}}` and `$` variables in the URL path.
 */
export function applyPathParamsToUrl(
  path: string,
  pathParams: readonly CollectionRequestPathParam[],
  variableContext: Readonly<Record<string, string>>,
): string {
  const valueByKey = new Map(pathParams.map((row) => [row.key, row.value ?? '']));

  const substituted = path.replace(PATH_PARAM_PATTERN, (_match, key: string) => {
    const value = valueByKey.get(key);
    return value !== undefined && value !== '' ? value : `:${key}`;
  });

  return resolveTemplateVariables(substituted, { environment: variableContext });
}
