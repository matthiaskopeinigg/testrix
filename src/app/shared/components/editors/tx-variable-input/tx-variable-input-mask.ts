/** Masks a secret value with asterisks for display (length preserved). */
export function maskVariableInputDisplay(value: string, maskChar = '*'): string {
  if (!value) {
    return '';
  }
  return maskChar.repeat(value.length);
}

/** Escapes plain text for safe HTML mirror output when masking. */
export function escapeVariableInputMaskHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
