import { describe, expect, it } from 'vitest';

import { GitCli, isSafeGitProxyUrl } from './git-cli';

describe('isSafeGitProxyUrl', () => {
  it.each([
    'http://proxy.local:8080',
    'https://user:pass@proxy.example.com',
    'socks5://127.0.0.1:1080',
    'socks5h://proxy:1080',
  ])('accepts %s', (value) => {
    // Act
    const isSafe = isSafeGitProxyUrl(value);

    // Assert
    expect(isSafe).toBe(true);
  });

  it.each([
    '',
    'proxy.local:8080',
    'file:///etc/passwd',
    'ext::sh -c touch% /tmp/pwned',
    'http://proxy.local:8080\n-c core.sshCommand=evil',
    'http://proxy local:8080',
    'http://',
  ])('rejects %j', (value) => {
    // Act
    const isSafe = isSafeGitProxyUrl(value);

    // Assert
    expect(isSafe).toBe(false);
  });
});

describe('GitCli branch names', () => {
  it('rejects a ref that could be read as a git option', async () => {
    const cli = new GitCli();
    const prefs = { proxyUrl: null, caPath: null, verifyTls: true };
    await expect(cli.fetch('/tmp', '--upload-pack=evil', prefs)).rejects.toThrow(/valid Git branch/);
    await expect(cli.push('/tmp', 'a..b', prefs)).rejects.toThrow(/valid Git branch/);
  });
});
