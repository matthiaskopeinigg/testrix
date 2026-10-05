export function canPreviewResponse(body: string, contentType: string): boolean {
  const type = contentType.toLowerCase();
  if (type.includes('html') || type.includes('xml') || type.includes('svg'))
    return true;
  const trimmed = body.slice(0, 1024).trimStart().slice(0, 64).toLowerCase();
  return (
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<svg') ||
    trimmed.startsWith('<?xml')
  );
}

/** No scripts, forms, plugins or `<base>` rewrites, even if the iframe sandbox is loosened. */
const PREVIEW_CSP = "script-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'";

/** Wraps a response body for the sandboxed `srcdoc` preview. */
export function previewDocument(body: string): string {
  return `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">${body}`;
}
