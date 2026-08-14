export interface UuidGenerateOptions {
  readonly count: number;
  readonly uppercase: boolean;
  readonly stripHyphens: boolean;
}

export function generateUuids(options: UuidGenerateOptions): readonly string[] {
  const n = Math.min(500, Math.max(1, options.count));
  const lines: string[] = [];
  for (let i = 0; i < n; i++) {
    let id: string = globalThis.crypto.randomUUID();
    if (options.stripHyphens) {
      id = id.replace(/-/g, '');
    }
    if (options.uppercase) {
      id = id.toUpperCase();
    }
    lines.push(id);
  }
  return lines;
}

export const NIL_UUID = '00000000-0000-0000-0000-000000000000';
