import { describe, expect, it } from 'vitest';

import {
  formatRelativeCommitTime,
  getAuthorAvatarHue,
  getAuthorInitials,
  isSameTeamAuthor,
} from './team-author';

describe('team-author', () => {
  it('derives initials from full name', () => {
    expect(getAuthorInitials('Ada Lovelace')).toBe('AL');
  });

  it('derives initials from email when name is empty', () => {
    expect(getAuthorInitials('', 'ada@example.com')).toBe('AD');
  });

  it('returns stable avatar hue for the same email', () => {
    expect(getAuthorAvatarHue('ada@example.com')).toBe(getAuthorAvatarHue('ada@example.com'));
  });

  it('formats recent commits as relative time', () => {
    const now = Date.parse('2026-05-24T12:00:00.000Z');
    expect(formatRelativeCommitTime('2026-05-24T11:30:00.000Z', now)).toBe('30m ago');
  });

  it('detects the current workspace author', () => {
    expect(isSameTeamAuthor('Ada@Example.com', 'ada@example.com')).toBe(true);
  });
});
