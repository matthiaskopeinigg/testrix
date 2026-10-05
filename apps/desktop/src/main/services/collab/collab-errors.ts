/**
 * Message shown to the person using Testrix. `code` picks the recovery hint.
 */
export class CollabUserError extends Error {
  constructor(
    message: string,
    readonly code: 'auth' | 'offline' | 'invalid' | 'tooling' = 'invalid',
  ) {
    super(message);
    this.name = 'CollabUserError';
  }
}
