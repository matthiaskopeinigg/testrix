/**
 * Git commit author display helpers for team collaboration UI.
 */

export interface TeamAuthorIdentity {
  readonly name: string;
  readonly email: string;
}

/**
 * Returns one or two uppercase initials from a display name or email.
 */
export function getAuthorInitials(name: string, email = ''): string {
  const trimmedName = name.trim();
  if (trimmedName.length > 0) {
    const parts = trimmedName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase();
    }
    return trimmedName.slice(0, 2).toUpperCase();
  }

  const local = email.trim().split('@')[0] ?? '';
  if (local.length >= 2) {
    return local.slice(0, 2).toUpperCase();
  }
  return local.charAt(0).toUpperCase() || '?';
}

/**
 * Stable hue (0–359) for avatar backgrounds derived from author email/name.
 */
export function getAuthorAvatarHue(email: string, name = ''): number {
  const seed = (email.trim() || name.trim()).toLowerCase();
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

/**
 * Short relative label for commit timestamps in lists.
 */
export function formatRelativeCommitTime(iso: string, nowMs = Date.now()): string {
  if (!iso) {
    return '—';
  }

  const date = new Date(iso);
  const timestamp = date.getTime();
  if (Number.isNaN(timestamp)) {
    return iso;
  }

  const diffSec = Math.max(0, Math.round((nowMs - timestamp) / 1000));
  if (diffSec < 45) {
    return 'Just now';
  }
  if (diffSec < 3600) {
    return `${Math.floor(diffSec / 60)}m ago`;
  }
  if (diffSec < 86_400) {
    return `${Math.floor(diffSec / 3600)}h ago`;
  }
  if (diffSec < 604_800) {
    return `${Math.floor(diffSec / 86_400)}d ago`;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date(nowMs).getFullYear() ? 'numeric' : undefined,
  }).format(date);
}

/**
 * Full timestamp for commit detail headers.
 */
export function formatCommitTimestamp(iso: string): string {
  if (!iso) {
    return '—';
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Returns true when the author email matches the active workspace commit author.
 */
export function isSameTeamAuthor(email: string, currentAuthorEmail?: string | null): boolean {
  const left = email.trim().toLowerCase();
  const right = currentAuthorEmail?.trim().toLowerCase() ?? '';
  return left.length > 0 && right.length > 0 && left === right;
}
