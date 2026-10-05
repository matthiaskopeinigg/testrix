import type { UpdateStatus } from '@testrix/contracts';

export type ReleaseNoteBlock =
  | { readonly kind: 'heading'; readonly text: string }
  | { readonly kind: 'paragraph'; readonly text: string }
  | { readonly kind: 'list'; readonly items: readonly string[] };

/** Status shown before the main process answers, and in the browser preview. */
export function idleUpdateStatus(currentVersion = '0.0.0'): UpdateStatus {
  return {
    phase: 'idle',
    currentVersion,
    channel: 'stable',
    prefs: { channel: null, autoCheck: true, autoDownload: true },
    isSupported: false,
    unsupportedReason: null,
    lastCheckedAt: null,
    release: null,
    percent: null,
    error: null,
    updatedFrom: null,
  };
}

/**
 * Turns the CHANGELOG section a release carries into headings, paragraphs and bullet lists.
 * Only the Markdown the changelog uses is recognised; everything else stays plain text.
 */
export function parseReleaseNotes(notes: string): readonly ReleaseNoteBlock[] {
  const blocks: ReleaseNoteBlock[] = [];
  let list: string[] | null = null;
  for (const raw of notes.split(/\r?\n/)) {
    const line = raw.trim();
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      list ??= [];
      list.push(stripInline(bullet[1] ?? ''));
      continue;
    }
    if (list) {
      blocks.push({ kind: 'list', items: list });
      list = null;
    }
    if (!line)
      continue;
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    blocks.push(heading ? { kind: 'heading', text: stripInline(heading[1] ?? '') } : { kind: 'paragraph', text: stripInline(line) });
  }
  if (list)
    blocks.push({ kind: 'list', items: list });
  return blocks;
}

function stripInline(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|`)/g, '')
    .trim();
}

/** One line for Settings: what the updater is doing right now. */
export function updateStatusLine(status: UpdateStatus): string {
  if (!status.isSupported)
    return status.unsupportedReason ?? 'Updates are not available for this build.';
  const version = status.release?.version;
  switch (status.phase) {
    case 'checking':
      return 'Checking for updates…';
    case 'up-to-date':
      return `Testrix ${status.currentVersion} is the latest ${channelLabel(status.channel)} release.`;
    case 'available':
      return `Testrix ${version} is available.`;
    case 'downloading':
      return isDownloadFinishing(status)
        ? 'Preparing the update…'
        : `Downloading Testrix ${version}… ${status.percent ?? 0}%`;
    case 'ready':
      return `Testrix ${version} is ready to install.`;
    case 'error':
      return status.error ?? 'The update check failed.';
    default:
      return status.prefs.autoCheck
        ? 'Testrix checks GitHub at most every six hours.'
        : 'Automatic checks are off.';
  }
}

export function channelLabel(channel: UpdateStatus['channel']): string {
  return channel === 'beta' ? 'Beta' : 'Stable';
}

/** "3 minutes ago" style text for the last check, or null when it never ran. */
export function lastCheckedLabel(lastCheckedAt: string | null, now = Date.now()): string | null {
  if (!lastCheckedAt)
    return null;
  const at = Date.parse(lastCheckedAt);
  if (Number.isNaN(at))
    return null;
  const minutes = Math.round((now - at) / 60_000);
  if (minutes < 1)
    return 'Last checked just now';
  if (minutes < 60)
    return `Last checked ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24)
    return `Last checked ${hours} hour${hours === 1 ? '' : 's'} ago`;
  return `Last checked ${new Date(at).toLocaleDateString()}`;
}

/** Bytes are in; hash and rename still run before the file is ready. */
export function isDownloadFinishing(status: UpdateStatus): boolean {
  return status.phase === 'downloading' && status.percent != null && status.percent >= 100;
}

/** Short version for the toast: `2.1.0` → `2.1`, prereleases stay whole. */
export function shortVersion(version: string): string {
  return /^\d+\.\d+\.0$/.test(version) ? version.replace(/\.0$/, '') : version;
}

export type UpdateBannerAction = 'download-install' | 'install';

export interface UpdateBannerCopy {
  readonly message: string;
  readonly action: UpdateBannerAction | null;
}

/**
 * Titlebar strip and Settings dot when a release is waiting, downloading, or ready.
 * Background download off still surfaces `available`.
 */
export function updateBannerCopy(status: UpdateStatus): UpdateBannerCopy | null {
  if (!status.isSupported)
    return null;
  const version = status.release?.version;
  if (!version)
    return null;
  const short = shortVersion(version);
  switch (status.phase) {
    case 'available':
      return { message: `Testrix ${short} is available`, action: 'download-install' };
    case 'downloading':
      return {
        message: isDownloadFinishing(status)
          ? 'Preparing the update…'
          : `Downloading Testrix ${short}… ${status.percent ?? 0}%`,
        action: null,
      };
    case 'ready':
      return { message: `Testrix ${short} is ready to install`, action: 'install' };
    default:
      return null;
  }
}
