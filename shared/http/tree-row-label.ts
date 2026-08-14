import { HTTP_METHOD_IDS, type HttpMethodId } from '../config/http-settings.schema';

/**
 * Removes a leading HTTP verb from a tree row label when the method is shown as a badge.
 */
export function stripHttpMethodPrefixFromLabel(method: string, label: string): string {
  const verb = method.trim().toUpperCase();
  const text = label.trim();
  if (!verb || !text) {
    return label;
  }
  const upper = text.toUpperCase();
  if (upper === verb) {
    return '';
  }
  const prefix = `${verb} `;
  if (upper.startsWith(prefix)) {
    return text.slice(prefix.length).trim();
  }
  return label;
}

/**
 * Tree row primary label when an HTTP method chip is visible beside the name.
 */
export function treeRowLabelWithHttpMethod(
  method: string | undefined,
  label: string,
  fallback = 'Request',
): string {
  const verb = method?.trim();
  if (!verb) {
    return label;
  }
  const stripped = stripHttpMethodPrefixFromLabel(verb, label);
  if (stripped) {
    return stripped;
  }
  return fallback;
}

/**
 * Returns true when `label` is only an HTTP method name (no URL or custom title).
 */
export function isHttpMethodOnlyTreeLabel(label: string): boolean {
  const trimmed = label.trim().toUpperCase();
  return (HTTP_METHOD_IDS as readonly string[]).includes(trimmed as HttpMethodId);
}
