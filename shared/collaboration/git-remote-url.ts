/**
 * Returns true when the remote uses SSH transport (keys / agent), not HTTPS tokens.
 */
export function isSshGitRemoteUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return false;
  }
  return (
    trimmed.startsWith('git@') ||
    trimmed.startsWith('ssh://') ||
    trimmed.toLowerCase().startsWith('ssh:')
  );
}

/**
 * Returns true when the remote uses HTTP(S) transport (PAT / credential manager).
 */
export function isHttpsGitRemoteUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  return trimmed.startsWith('https://') || trimmed.startsWith('http://');
}
