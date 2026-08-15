export interface PemBlockSummary {
  readonly label: string;
  readonly derBytes: number;
  readonly sha256: string;
}

const PEM_RE =
  /-----BEGIN ([A-Z0-9 ]+)-----([A-Za-z0-9+/=\s]+)-----END \1-----/g;

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function decodePemBody(body: string): Uint8Array | null {
  const compact = body.replace(/\s+/g, '');
  try {
    const binary = atob(compact);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Parses PEM certificates, CSRs, and keys into labeled blocks with SHA-256 fingerprints.
 */
export async function inspectPem(pem: string): Promise<readonly PemBlockSummary[]> {
  const summaries: PemBlockSummary[] = [];
  PEM_RE.lastIndex = 0;
  let match = PEM_RE.exec(pem);
  while (match) {
    const label = match[1]?.trim() ?? 'UNKNOWN';
    const der = decodePemBody(match[2] ?? '');
    if (!der) {
      summaries.push({ label, derBytes: 0, sha256: '(invalid base64)' });
      match = PEM_RE.exec(pem);
      continue;
    }
    const derCopy = new ArrayBuffer(der.byteLength);
    new Uint8Array(derCopy).set(der);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', derCopy);
    summaries.push({
      label,
      derBytes: der.length,
      sha256: bytesToHex(new Uint8Array(digest)),
    });
    match = PEM_RE.exec(pem);
  }
  return summaries;
}

/**
 * Formats PEM inspection results as readable text.
 */
export function formatPemInspection(blocks: readonly PemBlockSummary[]): string {
  if (blocks.length === 0) {
    return 'No PEM blocks found. Paste a CERTIFICATE, CERTIFICATE REQUEST, or PUBLIC KEY.';
  }
  return blocks
    .map(
      (block, index) =>
        `${index + 1}. ${block.label}\n   DER bytes: ${block.derBytes}\n   SHA-256: ${block.sha256}`,
    )
    .join('\n\n');
}
