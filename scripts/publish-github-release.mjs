/**
 * Attaches Windows, macOS, and Linux installers to a GitHub Release **draft**.
 * Does not publish. Create the public release from the GitHub UI when ready.
 *
 * Env:
 *   RELEASE_TAG  GitHub tag (e.g. v1.0.2-beta.1)
 *   GH_TOKEN     GitHub token (set by Actions)
 *
 * Usage:
 *   node scripts/publish-github-release.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED_ASSETS = ['Testrix-Setup.exe', 'Testrix-Setup.AppImage', 'Testrix-Setup.dmg'];
const UPLOAD_ATTEMPTS = 4;

/**
 * Recursively finds a file by basename under `dir`.
 *
 * @param {string} dir Directory to search.
 * @param {string} name File name.
 * @returns {string | null} Absolute path, or null.
 */
export function findNamedFile(dir, name) {
  if (!existsSync(dir)) {
    return null;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findNamedFile(path, name);
      if (nested) {
        return nested;
      }
    } else if (entry.name === name) {
      return path;
    }
  }
  return null;
}

function gh(args, options = {}) {
  execFileSync('gh', args, { stdio: options.stdio ?? 'inherit', encoding: 'utf8' });
}

function ghCapture(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function releaseExists(tag) {
  try {
    ghCapture(['release', 'view', tag, '--json', 'id']);
    return true;
  } catch {
    return false;
  }
}

function releaseAssetNames(tag) {
  const raw = ghCapture(['release', 'view', tag, '--json', 'assets']);
  const parsed = JSON.parse(raw);
  return (parsed.assets ?? []).map((asset) => asset.name);
}

function uploadWithRetry(tag, filePath) {
  let lastError = null;
  for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt += 1) {
    try {
      console.log(`Uploading ${filePath} (attempt ${attempt}/${UPLOAD_ATTEMPTS})`);
      gh(['release', 'upload', tag, filePath, '--clobber']);
      return;
    } catch (error) {
      lastError = error;
      console.error(`Upload failed (attempt ${attempt}):`, error instanceof Error ? error.message : error);
    }
  }
  throw lastError ?? new Error(`Could not upload ${filePath}`);
}

/**
 * Returns a GitHub release title from a tag (`v1.0.3-beta.9`).
 *
 * @param {string} tag GitHub tag or semver.
 */
function githubReleaseTitle(tag) {
  const trimmed = tag.trim();
  if (!trimmed) {
    return trimmed;
  }
  return /^v/i.test(trimmed) ? trimmed : `v${trimmed}`;
}

function main() {
  const tag = (process.env.RELEASE_TAG ?? '').trim();
  if (!tag) {
    throw new Error('RELEASE_TAG is required');
  }
  const artifactsDir = join(root, 'artifacts');
  const notesPath = join(root, 'release-notes.md');
  if (!existsSync(notesPath)) {
    throw new Error(`Missing ${notesPath}`);
  }

  const files = {};
  for (const name of REQUIRED_ASSETS) {
    const path = findNamedFile(artifactsDir, name);
    if (!path) {
      throw new Error(`Missing installer artifact ${name} under artifacts/`);
    }
    files[name] = path;
    console.log(`Found ${name} at ${path}`);
  }

  const prerelease = tag.includes('-');
  if (!releaseExists(tag)) {
    const createArgs = [
      'release',
      'create',
      tag,
      '--title',
      githubReleaseTitle(tag),
      '--notes-file',
      notesPath,
      '--draft',
    ];
    if (prerelease) {
      createArgs.push('--prerelease');
    }
    gh(createArgs);
  } else {
    console.log(`Release ${tag} already exists; attaching artifacts`);
    const editArgs = [
      'release',
      'edit',
      tag,
      '--title',
      githubReleaseTitle(tag),
      '--notes-file',
      notesPath,
      '--draft',
    ];
    if (prerelease) {
      editArgs.push('--prerelease');
    }
    gh(editArgs);
  }

  for (const name of REQUIRED_ASSETS) {
    uploadWithRetry(tag, files[name]);
  }

  const attached = new Set(releaseAssetNames(tag));
  const missing = REQUIRED_ASSETS.filter((name) => !attached.has(name));
  if (missing.length > 0) {
    throw new Error(`Release ${tag} is missing assets: ${missing.join(', ')}`);
  }

  console.log(`Draft ${githubReleaseTitle(tag)} is ready with ${REQUIRED_ASSETS.join(', ')}`);
}

if (process.argv[1] && basename(process.argv[1]) === 'publish-github-release.mjs') {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
