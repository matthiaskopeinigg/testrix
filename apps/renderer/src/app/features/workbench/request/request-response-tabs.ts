import { REQUEST_RESPONSE_TABS, type RequestResponseTab } from '@testrix/contracts'

export const RESPONSE_TAB_LABELS: Record<RequestResponseTab, string> = {
  pretty: 'Pretty',
  raw: 'Raw',
  preview: 'Preview',
  headers: 'Headers',
  cookies: 'Cookies',
  timeline: 'Timeline',
  redirects: 'Redirects',
  diff: 'Diff',
  runs: 'Runs',
}

export interface ResponseTabLayoutInput {
  readonly hasTiming: boolean
  readonly runCount: number
  readonly redirectCount: number
  readonly canDiff: boolean
  readonly canPreview: boolean
}

const OVERFLOW_TAB_ORDER: readonly RequestResponseTab[] = [
  'raw',
  'preview',
  'cookies',
  'redirects',
  'diff',
]

/**
 * Primary response tabs: Pretty, Headers, optional Timeline / Runs, plus promoted Redirects / Diff.
 */
export function primaryResponseTabs(input: ResponseTabLayoutInput): readonly RequestResponseTab[] {
  const tabs: RequestResponseTab[] = ['pretty']
  if (input.canPreview)
    tabs.push('preview')
  tabs.push('headers')
  if (input.hasTiming)
    tabs.push('timeline')
  if (input.runCount > 0)
    tabs.push('runs')
  if (input.redirectCount > 0)
    tabs.push('redirects')
  if (input.canDiff)
    tabs.push('diff')
  return tabs
}

/** Overflow tabs shown under the More menu (excluding items already promoted). */
export function overflowResponseTabs(input: ResponseTabLayoutInput): readonly RequestResponseTab[] {
  const primary = new Set(primaryResponseTabs(input))
  return OVERFLOW_TAB_ORDER.filter((id) => !primary.has(id))
}

export function responseTabLabel(id: RequestResponseTab): string {
  return RESPONSE_TAB_LABELS[id] ?? id
}

/** Keeps slide direction stable when tabs move between primary and overflow. */
export function allResponseTabsInOrder(): readonly RequestResponseTab[] {
  return REQUEST_RESPONSE_TABS
}
