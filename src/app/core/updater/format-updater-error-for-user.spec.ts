import { formatUpdaterErrorForUser } from './format-updater-error-for-user';

describe('formatUpdaterErrorForUser', () => {
  it('maps rate limit errors to friendly copy', () => {
    expect(formatUpdaterErrorForUser('HTTP 429 rate limit')).toContain('Too many update checks');
  });

  it('maps GitHub network failures to proxy-aware copy', () => {
    expect(
      formatUpdaterErrorForUser(
        'Could not reach GitHub to check for updates (net::ERR_PROXY_CONNECTION_FAILED).',
      ),
    ).toContain('Settings');
  });

  it('preserves GitHub availability guidance', () => {
    expect(
      formatUpdaterErrorForUser(
        'GitHub releases are unavailable. Confirm the repository is public or try again later.',
      ),
    ).toContain('GitHub releases are unavailable');
  });

  it('maps a missing latest feed to the beta-channel hint', () => {
    expect(formatUpdaterErrorForUser('Cannot find channel latest.yml')).toContain(
      'switch the release channel to Beta',
    );
  });
});
