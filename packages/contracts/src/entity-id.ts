/**
 * Canonical id for persisted config / workspace entities.
 * Always a UUID (RFC 4122) from the Web Crypto API.
 */
export function newEntityId(): string {
  return globalThis.crypto.randomUUID();
}
