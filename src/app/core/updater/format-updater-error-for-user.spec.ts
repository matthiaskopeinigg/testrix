import { formatUpdaterErrorForUser } from './format-updater-error-for-user';

describe('formatUpdaterErrorForUser', () => {
  it('maps rate limit errors to friendly copy', () => {
    expect(formatUpdaterErrorForUser('HTTP 429 rate limit')).toContain('Too many update checks');
  });
});
