import { describe, expect, it } from 'vitest';

import {
  idleUpdateStatus,
  isDownloadFinishing,
  lastCheckedLabel,
  parseReleaseNotes,
  shortVersion,
  updateBannerCopy,
  updateStatusLine,
} from './update-view';

describe('parseReleaseNotes', () => {
  it('reads the headings and bullets a changelog section uses', () => {
    // Arrange
    const notes = '### Added\n\n- **Updates** in Settings\n- [Docs](https://x) for `release`\n\n### Fixed\nSync no longer spins.';

    // Act
    const blocks = parseReleaseNotes(notes);

    // Assert
    expect(blocks).toEqual([
      { kind: 'heading', text: 'Added' },
      { kind: 'list', items: ['Updates in Settings', 'Docs for release'] },
      { kind: 'heading', text: 'Fixed' },
      { kind: 'paragraph', text: 'Sync no longer spins.' },
    ]);
  });

  it('returns nothing for empty notes', () => {
    expect(parseReleaseNotes('  \n')).toEqual([]);
  });
});

describe('updateStatusLine', () => {
  const base = { ...idleUpdateStatus('2.0.0'), isSupported: true };
  const release = { version: '2.1.0', notes: '', releasedAt: '', size: 1 };

  it('describes each phase', () => {
    expect(updateStatusLine({ ...base, phase: 'up-to-date' })).toBe('Testrix 2.0.0 is the latest Stable release.');
    expect(updateStatusLine({ ...base, phase: 'downloading', percent: 42, release })).toBe('Downloading Testrix 2.1.0… 42%');
    expect(updateStatusLine({ ...base, phase: 'downloading', percent: 100, release })).toBe('Preparing the update…');
    expect(updateStatusLine({ ...base, phase: 'ready', release })).toBe('Testrix 2.1.0 is ready to install.');
    expect(updateStatusLine({ ...base, phase: 'error', error: 'Offline' })).toBe('Offline');
  });

  it('explains why a build cannot update', () => {
    expect(updateStatusLine({ ...base, isSupported: false, unsupportedReason: 'Development builds do not update themselves.' })).toBe(
      'Development builds do not update themselves.',
    );
  });
});

describe('lastCheckedLabel', () => {
  const now = Date.parse('2026-09-02T12:00:00.000Z');

  it('uses relative minutes and hours', () => {
    expect(lastCheckedLabel(null, now)).toBeNull();
    expect(lastCheckedLabel('2026-09-02T11:59:50.000Z', now)).toBe('Last checked just now');
    expect(lastCheckedLabel('2026-09-02T11:55:00.000Z', now)).toBe('Last checked 5 minutes ago');
    expect(lastCheckedLabel('2026-09-02T09:00:00.000Z', now)).toBe('Last checked 3 hours ago');
  });
});

describe('updateBannerCopy', () => {
  const base = { ...idleUpdateStatus('2.0.0'), isSupported: true };
  const release = { version: '2.1.0', notes: '', releasedAt: '', size: 1 };

  it('offers Download & Install while a release is waiting', () => {
    expect(updateBannerCopy({ ...base, phase: 'available', release })).toEqual({
      message: 'Testrix 2.1 is available',
      action: 'download-install',
    });
    expect(updateBannerCopy({ ...base, phase: 'ready', release })).toEqual({
      message: 'Testrix 2.1 is ready to install',
      action: 'install',
    });
    expect(updateBannerCopy({ ...base, phase: 'up-to-date' })).toBeNull();
    expect(updateBannerCopy({ ...base, phase: 'downloading', percent: 100, release })).toEqual({
      message: 'Preparing the update…',
      action: null,
    });
  });
});

describe('isDownloadFinishing', () => {
  const base = { ...idleUpdateStatus('2.0.0'), isSupported: true };
  const release = { version: '2.1.0', notes: '', releasedAt: '', size: 1 };

  it('is true only after the last download byte', () => {
    expect(isDownloadFinishing({ ...base, phase: 'downloading', percent: 99, release })).toBe(false);
    expect(isDownloadFinishing({ ...base, phase: 'downloading', percent: 100, release })).toBe(true);
    expect(isDownloadFinishing({ ...base, phase: 'ready', percent: 100, release })).toBe(false);
  });
});

describe('shortVersion', () => {
  it('drops a trailing .0 from releases only', () => {
    expect(shortVersion('2.1.0')).toBe('2.1');
    expect(shortVersion('2.1.3')).toBe('2.1.3');
    expect(shortVersion('2.1.0-beta.1')).toBe('2.1.0-beta.1');
  });
});
