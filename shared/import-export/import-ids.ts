/** Generates a unique id for import/export conversions. */
export function newImportId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `import-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Returns ISO timestamps for new config file meta blocks. */
export function importMetaNow(): { createdAt: string; updatedAt: string } {
  const ts = new Date().toISOString();
  return { createdAt: ts, updatedAt: ts };
}
