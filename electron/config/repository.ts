import { app } from 'electron';

/** Public GitHub repository for Testrix. */
export const GITHUB_REPOSITORY = 'matthiaskopeinigg/testrix' as const;

/** Base URL for filing a new GitHub issue. */
export const GITHUB_NEW_ISSUE_URL = `https://github.com/${GITHUB_REPOSITORY}/issues/new`;

/**
 * Builds a pre-filled GitHub issue URL for startup failures.
 */
export function buildErrorReportIssueUrl(message: string): string {
  const params = new URLSearchParams({
    title: 'Testrix failed to start',
    body: [
      '## What happened',
      '',
      message.trim() || '_Describe what you saw when Testrix failed to start._',
      '',
      '## Environment',
      '',
      `- Testrix version: ${app.getVersion()}`,
      `- Platform: ${process.platform}`,
      `- OS: ${process.getSystemVersion()}`,
      '',
      '## Additional context',
      '',
      '_Add steps to reproduce, log excerpts, or screenshots if available._',
    ].join('\n'),
  });

  return `${GITHUB_NEW_ISSUE_URL}?${params.toString()}`;
}
