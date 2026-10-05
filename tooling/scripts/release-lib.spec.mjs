import { generateKeyPairSync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  buildManifest,
  bumpPackageJson,
  changelogSection,
  channelForVersion,
  compareVersions,
  readStringConstant,
  releaseChangelog,
  installerDownloadUrl,
  sha512Base64,
  shouldStableReplaceBeta,
  signManifest,
  verifyManifest,
  writeStringConstant,
} from './release-lib.mjs';

const CHANGELOG = [
  '# Changelog',
  '',
  '## [Unreleased]',
  '',
  '### Added',
  '',
  '- Updater.',
  '',
  '## [2.0.0-beta.1] — 2026-09-15',
  '',
  'Greenfield shell.',
  '',
].join('\r\n');

function keys() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicBase64: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

describe('release versions', () => {
  it('orders releases and prereleases like semver', () => {
    // Act
    const ordered = ['2.0.0', '2.0.0-beta.2', '2.0.0-beta.10', '1.9.9', '2.0.0-rc.1', '2.0.1'].sort(
      compareVersions,
    );

    // Assert
    expect(ordered).toEqual([
      '1.9.9',
      '2.0.0-beta.2',
      '2.0.0-beta.10',
      '2.0.0-rc.1',
      '2.0.0',
      '2.0.1',
    ]);
  });

  it('routes prereleases to beta and lets a newer stable replace beta', () => {
    // Act
    const channels = ['2.1.0', '2.1.0-beta.1', '2.1.0-rc.1'].map(channelForVersion);

    // Assert
    expect(channels).toEqual(['stable', 'beta', 'beta']);
    expect(shouldStableReplaceBeta('2.1.0', '2.1.0-beta.3')).toBe(true);
    expect(shouldStableReplaceBeta('2.1.0', '2.2.0-beta.1')).toBe(false);
    expect(shouldStableReplaceBeta('2.1.0', null)).toBe(true);
  });
});

describe('release changelog', () => {
  it('reads one version section and moves Unreleased notes under a new version', () => {
    // Act
    const notes = changelogSection(CHANGELOG, '2.0.0-beta.1');
    const released = releaseChangelog(CHANGELOG, '2.1.0', '2026-10-01');

    // Assert
    expect(notes).toBe('Greenfield shell.');
    expect(changelogSection(released, '2.1.0')).toBe('### Added\n\n- Updater.');
    expect(changelogSection(released, 'Unreleased')).toBe('');
    expect(released).toContain('\r\n');
    expect(() => releaseChangelog(released, '2.1.0', '2026-10-02')).toThrow('already has');
  });

  it('bumps package versions and exact internal pins only', () => {
    // Arrange
    const text = JSON.stringify({
      name: '@testrix/desktop',
      version: '2.0.0-beta.1',
      dependencies: { '@testrix/contracts': '2.0.0-beta.1', '@testrix/ui': '*', zod: '4.6.5' },
    });

    // Act
    const bumped = JSON.parse(bumpPackageJson(text, '2.1.0'));

    // Assert
    expect(bumped.version).toBe('2.1.0');
    expect(bumped.dependencies).toEqual({
      '@testrix/contracts': '2.1.0',
      '@testrix/ui': '*',
      zod: '4.6.5',
    });
  });
});

describe('installer download URL', () => {
  it('writes the GitHub release path, or the same path under a local origin', () => {
    const github = installerDownloadUrl({
      repository: 'o/r',
      tag: 'v2.1.0',
      assetName: 'Testrix.exe',
    });
    const local = installerDownloadUrl({
      repository: 'o/r',
      tag: 'v99.0.0',
      assetName: 'Testrix.exe',
      downloadBase: 'http://127.0.0.1:4173/',
    });

    expect(github).toBe('https://github.com/o/r/releases/download/v2.1.0/Testrix.exe');
    expect(local).toBe('http://127.0.0.1:4173/o/r/releases/download/v99.0.0/Testrix.exe');
  });
});

describe('release manifest signing', () => {
  it('signs the exact bytes and rejects tampering or another key', () => {
    // Arrange
    const signer = keys();
    const stranger = keys();
    const manifest = buildManifest({
      version: '2.1.0',
      channel: 'stable',
      releasedAt: '2026-10-01T00:00:00.000Z',
      notes: 'Notes',
      url: 'https://github.com/o/r/releases/download/v2.1.0/Testrix.exe',
      sha512: sha512Base64(Buffer.from('exe')),
      size: 3,
    });

    // Act
    const signature = signManifest(manifest, signer.privatePem);

    // Assert
    expect(verifyManifest(manifest, signature, signer.publicBase64)).toBe(true);
    expect(verifyManifest(manifest.replace('2.1.0', '9.9.9'), signature, signer.publicBase64)).toBe(
      false,
    );
    expect(verifyManifest(manifest, signature, stranger.publicBase64)).toBe(false);
    expect(JSON.parse(manifest)).not.toHaveProperty('minVersion');
  });

  it('reads and rewrites string constants in TypeScript sources', () => {
    // Arrange
    const source = "export const UPDATE_PUBLIC_KEY = 'old';\n";

    // Act
    const next = writeStringConstant(source, 'UPDATE_PUBLIC_KEY', 'new');

    // Assert
    expect(readStringConstant(next, 'UPDATE_PUBLIC_KEY')).toBe('new');
    expect(() => readStringConstant(source, 'MISSING')).toThrow('Could not find MISSING');
  });
});
