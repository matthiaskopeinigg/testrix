export const UPDATER_DOWNLOAD_RELEASES_PAGE_URL =
  'https://github.com/matthiaskopeinigg/testrix/releases/latest';

export interface UpdaterErrorDisplay {
  readonly message: string;
  readonly showWebsiteDownloadLink: boolean;
}

export function formatUpdaterErrorBannerTitle(raw: string | undefined | null): string {
  const m = String(raw ?? '');
  if (
    /openExternal/i.test(m) ||
    /failed to open/i.test(m) ||
    (/could not/i.test(m) && /open/i.test(m))
  ) {
    return 'Couldn\u2019t open release page';
  }
  return 'Couldn\u2019t check for updates';
}

export function getUpdaterErrorDisplay(raw: string | undefined | null): UpdaterErrorDisplay {
  const m = String(raw ?? '').trim();
  if (!m) {
    return {
      message:
        'We couldn\u2019t reach the update service. Check your internet connection and try again.',
      showWebsiteDownloadLink: false,
    };
  }

  const lower = m.toLowerCase();

  if (lower.includes('timed out') || lower.includes('timeout') || lower.includes('etimedout')) {
    return {
      message: 'The update check timed out. Try again when your connection is stable.',
      showWebsiteDownloadLink: false,
    };
  }

  if (
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('enetunreach') ||
    lower.includes('network')
  ) {
    return {
      message: 'We couldn\u2019t connect. Check your internet connection and try again.',
      showWebsiteDownloadLink: false,
    };
  }

  if (/\b403\b/.test(m) || /\b429\b/.test(m) || lower.includes('rate limit')) {
    return {
      message: 'Too many update checks were made. Wait a few minutes and try again.',
      showWebsiteDownloadLink: true,
    };
  }

  if (lower.includes('github releases are unavailable')) {
    return {
      message: m,
      showWebsiteDownloadLink: true,
    };
  }

  if (lower.includes('github denied access')) {
    return {
      message: m,
      showWebsiteDownloadLink: true,
    };
  }

  if (/\b5\d\d\b/.test(m) || lower.includes('github api request failed')) {
    return {
      message: 'The update service had a problem. Try again later.',
      showWebsiteDownloadLink: true,
    };
  }

  return {
    message: 'Something went wrong while checking for updates. Try again later.',
    showWebsiteDownloadLink: true,
  };
}

export function formatUpdaterErrorForUser(raw: string | undefined | null): string {
  return getUpdaterErrorDisplay(raw).message;
}
