import type { HttpMethod } from '@testrix/contracts'

export type SendOutcomeAction =
  | 'auth'
  | 'body'
  | 'environment'

export interface SendOutcomeHint {
  readonly id: string
  readonly message: string
  readonly action: SendOutcomeAction
  readonly actionLabel: string
}

const MUSTACHE_RE = /\{\{[^}]+\}\}/

function textHasUnresolvedMustache(value: string): boolean {
  return MUSTACHE_RE.test(value)
}

export interface SendOutcomeInput {
  readonly status: number
  readonly method: HttpMethod
  readonly url: string
  readonly headerValues: readonly string[]
  readonly body: string
}

/**
 * Soft suggestions shown on Overview after Send completes.
 */
export function sendOutcomeHints(input: SendOutcomeInput): readonly SendOutcomeHint[] {
  const hints: SendOutcomeHint[] = []

  if (input.status === 401 || input.status === 403) {
    hints.push({
      id: 'auth-status',
      message: `${input.status} often means missing or expired credentials.`,
      action: 'auth',
      actionLabel: 'Review Auth',
    })
  }

  if (input.status === 415 && input.method !== 'GET' && input.method !== 'HEAD') {
    hints.push({
      id: 'body-415',
      message: '415 usually means the Content-Type or body does not match what the server expects.',
      action: 'body',
      actionLabel: 'Review Body',
    })
  }

  const unresolved =
    textHasUnresolvedMustache(input.url)
    || input.headerValues.some((value) => textHasUnresolvedMustache(value))
    || textHasUnresolvedMustache(input.body)
  if (unresolved) {
    hints.push({
      id: 'vars-unresolved',
      message: 'Some {{variables}} were not resolved — pick an environment or fix placeholders.',
      action: 'environment',
      actionLabel: 'Pick environment',
    })
  }

  return hints
}
