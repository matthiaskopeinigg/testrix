import { z } from 'zod';

/** Where HTTP verbs appear in the collections UI. */
export const HTTP_METHOD_DISPLAY_IDS = [
  'tree-and-tab',
  'tree',
  'tab',
  'never',
] as const;

export type HttpMethodDisplayId = (typeof HTTP_METHOD_DISPLAY_IDS)[number];

export const httpMethodDisplaySchema = z.enum(HTTP_METHOD_DISPLAY_IDS);

export const DEFAULT_HTTP_METHOD_DISPLAY: HttpMethodDisplayId = 'tree-and-tab';

/**
 * Coerces persisted values to a valid display mode (unknown → default).
 */
export function coerceHttpMethodDisplay(value: unknown): HttpMethodDisplayId {
  if (value === 'tree' || value === 'tab' || value === 'never' || value === 'tree-and-tab') {
    return value;
  }
  return DEFAULT_HTTP_METHOD_DISPLAY;
}

/** Whether request methods appear in the collections sidebar tree. */
export function httpMethodShowsInTree(mode: HttpMethodDisplayId): boolean {
  return mode === 'tree' || mode === 'tree-and-tab';
}

/** Whether request methods appear on workspace editor tabs. */
export function httpMethodShowsInTab(mode: HttpMethodDisplayId): boolean {
  return mode === 'tab' || mode === 'tree-and-tab';
}
