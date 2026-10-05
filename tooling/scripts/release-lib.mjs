// Pure helpers behind the release scripts. The app has the same version rules in
// packages/contracts/src/update.ts; keep the two in step.
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/** @param {string} version */
export function parseVersion(version) {
  const match = SEMVER.exec(version.trim().replace(/^v/, ''));
  if (!match) return null;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

/** @param {string} a @param {string} b */
function compareIdentifiers(a, b) {
  const aNumeric = /^\d+$/.test(a);
  const bNumeric = /^\d+$/.test(b);
  if (aNumeric && bNumeric) return Math.sign(Number(a) - Number(b));
  if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Semantic-version order: -1, 0 or 1. @param {string} a @param {string} b */
export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return left ? 1 : right ? -1 : 0;
  for (let index = 0; index < 3; index += 1) {
    const diff = Math.sign(left.core[index] - right.core[index]);
    if (diff !== 0) return diff;
  }
  if (left.prerelease.length === 0 || right.prerelease.length === 0)
    return Math.sign(right.prerelease.length - left.prerelease.length);
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const l = left.prerelease[index];
    const r = right.prerelease[index];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    const diff = compareIdentifiers(l, r);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Prerelease versions ship on beta, everything else on stable. @param {string} version */
export function channelForVersion(version) {
  return parseVersion(version)?.prerelease.length ? 'beta' : 'stable';
}

/**
 * A stable release also becomes the beta build when it is newer than the current beta,
 * so beta users are never left behind.
 * @param {string} stableVersion @param {string | null} currentBetaVersion
 */
export function shouldStableReplaceBeta(stableVersion, currentBetaVersion) {
  return !currentBetaVersion || compareVersions(stableVersion, currentBetaVersion) > 0;
}

/** @param {string} value */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Body of the CHANGELOG section for `version`, without its heading. Empty when missing.
 * @param {string} changelog @param {string} version
 */
export function changelogSection(changelog, version) {
  const text = changelog.replace(/\r\n/g, '\n');
  const heading = new RegExp(`^## \\[${escapeRegExp(version)}\\][^\\n]*\\n`, 'm');
  const match = heading.exec(text);
  if (!match) return '';
  const rest = text.slice(match.index + match[0].length);
  const next = rest.search(/^## \[/m);
  return (next < 0 ? rest : rest.slice(0, next)).trim();
}

/**
 * Moves the Unreleased notes under a new version heading and leaves Unreleased empty.
 * @param {string} changelog @param {string} version @param {string} date YYYY-MM-DD
 */
export function releaseChangelog(changelog, version, date) {
  const eol = changelog.includes('\r\n') ? '\r\n' : '\n';
  const text = changelog.replace(/\r\n/g, '\n');
  if (new RegExp(`^## \\[${escapeRegExp(version)}\\]`, 'm').test(text))
    throw new Error(`CHANGELOG already has a ${version} section`);
  const unreleased = /^## \[Unreleased\][^\n]*\n/m.exec(text);
  if (!unreleased) throw new Error('CHANGELOG has no "## [Unreleased]" section');
  const at = unreleased.index + unreleased[0].length;
  const next = `\n## [${version}] — ${date}\n`;
  return (text.slice(0, at) + next + text.slice(at)).replace(/\n/g, eol);
}

/**
 * Sets `version` in a package.json and in any exact `@testrix/*` dependency pins.
 * @param {string} text @param {string} version
 */
export function bumpPackageJson(text, version) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const json = JSON.parse(text);
  json.version = version;
  for (const field of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ]) {
    const deps = json[field];
    if (!deps) continue;
    for (const name of Object.keys(deps)) {
      if (name.startsWith('@testrix/') && parseVersion(deps[name])) deps[name] = version;
    }
  }
  return `${JSON.stringify(json, null, 2)}\n`.replace(/\n/g, eol);
}

/**
 * Installer URL on GitHub, or the same path under a local release origin.
 * @param {{ repository: string, tag: string, assetName: string, downloadBase?: string }} options
 */
export function installerDownloadUrl(options) {
  const host = options.downloadBase?.replace(/\/+$/, '') || 'https://github.com';
  return `${host}/${options.repository}/releases/download/${options.tag}/${options.assetName}`;
}

/** Base64 SHA-512 of a file's bytes. @param {Buffer} bytes */
export function sha512Base64(bytes) {
  return createHash('sha512').update(bytes).digest('base64');
}

/**
 * @param {{ version: string, channel: 'stable' | 'beta', releasedAt: string, notes: string,
 *   url: string, sha512: string, size: number, minVersion?: string }} fields
 */
export function buildManifest(fields) {
  const manifest = {
    version: fields.version,
    channel: fields.channel,
    releasedAt: fields.releasedAt,
    notes: fields.notes,
    url: fields.url,
    sha512: fields.sha512,
    size: fields.size,
  };
  if (fields.minVersion) manifest.minVersion = fields.minVersion;
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/** Base64 Ed25519 signature over the exact manifest bytes. @param {string} manifest @param {string} privateKeyPem */
export function signManifest(manifest, privateKeyPem) {
  const key = createPrivateKey(privateKeyPem);
  return sign(null, Buffer.from(manifest, 'utf8'), key).toString('base64');
}

/** @param {string} manifest @param {string} signature @param {string} publicKeyBase64 SPKI DER */
export function verifyManifest(manifest, signature, publicKeyBase64) {
  try {
    const key = createPublicKey({
      key: Buffer.from(publicKeyBase64, 'base64'),
      format: 'der',
      type: 'spki',
    });
    return verify(
      null,
      Buffer.from(manifest, 'utf8'),
      key,
      Buffer.from(signature.trim(), 'base64'),
    );
  } catch {
    return false;
  }
}

/** Reads a `export const NAME = '...'` string constant out of a TypeScript source. @param {string} source @param {string} name */
export function readStringConstant(source, name) {
  const match = new RegExp(`export const ${name} = '([^']*)';`).exec(source);
  if (!match) throw new Error(`Could not find ${name}`);
  return match[1];
}

/** @param {string} source @param {string} name @param {string} value */
export function writeStringConstant(source, name, value) {
  readStringConstant(source, name);
  return source.replace(
    new RegExp(`export const ${name} = '[^']*';`),
    `export const ${name} = '${value}';`,
  );
}
