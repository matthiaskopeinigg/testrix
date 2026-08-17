/**
 * Retitles existing GitHub releases to the tag (`v1.0.3-beta.9`), strips
 * changelog version/date headings from notes, and converts them to drafts.
 *
 * Usage:
 *   node scripts/normalize-github-releases.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { stripChangelogVersionHeading } from './changelog-release-notes.mjs';

function ghCapture(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function gh(args) {
  execFileSync('gh', args, { stdio: 'inherit', encoding: 'utf8' });
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
  const raw = ghCapture([
    'release',
    'list',
    '--limit',
    '100',
    '--json',
    'tagName,isPrerelease',
  ]);
  const releases = JSON.parse(raw);
  const dir = mkdtempSync(join(tmpdir(), 'testrix-release-notes-'));
  try {
    for (const release of releases) {
      const tag = String(release.tagName ?? '');
      const title = githubReleaseTitle(tag);
      const view = JSON.parse(ghCapture(['release', 'view', tag, '--json', 'body']));
      const notes = stripChangelogVersionHeading(String(view.body ?? '').trim()) + '\n';
      const notesPath = join(dir, `${tag.replace(/[^\w.-]+/g, '_')}.md`);
      writeFileSync(notesPath, notes, 'utf8');
      const editArgs = [
        'release',
        'edit',
        tag,
        '--title',
        title,
        '--draft',
        '--notes-file',
        notesPath,
      ];
      if (release.isPrerelease) {
        editArgs.push('--prerelease');
      }
      console.log(`Updating ${tag} → title ${title} (draft)`);
      gh(editArgs);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && basename(process.argv[1]) === 'normalize-github-releases.mjs') {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
