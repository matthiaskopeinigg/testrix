/**
 * Writes Keep a Changelog notes for a GitHub release tag.
 *
 * Usage:
 *   node scripts/changelog-release-notes.mjs --tag v1.0.1-beta.8
 *   node scripts/changelog-release-notes.mjs --tag v1.0.1-beta.8 --out notes.md
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function argValue(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) {
    return process.argv[index + 1] ?? '';
  }
  return '';
}

function changelogVersionFromTag(tag) {
  return tag.trim().replace(/^v/i, '');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string} markdown
 * @param {string} tag
 */
export function extractChangelogReleaseNotes(markdown, tag) {
  const version = changelogVersionFromTag(tag);
  if (!version) {
    throw new Error('A release tag or version is required');
  }
  const heading = new RegExp(`^## \\[${escapeRegExp(version)}\\](?:\\s|$)`, 'm');
  const match = heading.exec(markdown);
  if (!match || match.index == null) {
    throw new Error(`No CHANGELOG.md section found for ${version}`);
  }
  const from = match.index;
  const rest = markdown.slice(from + match[0].length);
  const nextHeading = rest.search(/^## /m);
  const nextLinkRef = rest.search(/^\[[^\]]+\]:\s/m);
  let endOffset = rest.length;
  if (nextHeading >= 0) {
    endOffset = Math.min(endOffset, nextHeading);
  }
  if (nextLinkRef >= 0) {
    endOffset = Math.min(endOffset, nextLinkRef);
  }
  const section = markdown.slice(from, from + match[0].length + endOffset).trim();
  return stripChangelogVersionHeading(section) + '\n';
}

/**
 * Removes `## [1.0.3-beta.9]` / `## [1.0.3-beta.9] - 2026-08-17` from release notes.
 *
 * @param {string} section Changelog section including the version heading.
 */
export function stripChangelogVersionHeading(section) {
  return section.replace(/^## \[[^\]]+\](?:\s+-\s+\d{4}-\d{2}-\d{2})?\s*/, '').trim();
}

function listChangelogVersions(markdown) {
  const versions = [];
  const heading = /^## \[([^\]]+)\]/gm;
  let match = heading.exec(markdown);
  while (match) {
    const version = match[1];
    if (version && version !== 'Unreleased') {
      versions.push(version);
    }
    match = heading.exec(markdown);
  }
  return versions;
}

function main() {
  const changelogPath = argValue('changelog') || join(root, 'CHANGELOG.md');
  const markdown = readFileSync(changelogPath, 'utf8');
  if (process.argv.includes('--list')) {
    process.stdout.write(listChangelogVersions(markdown).join('\n') + '\n');
    return;
  }
  const tag = argValue('tag') || process.argv[2] || '';
  const notes = extractChangelogReleaseNotes(markdown, tag);
  const out = argValue('out');
  if (out) {
    writeFileSync(out, notes, 'utf8');
    return;
  }
  process.stdout.write(notes);
}

const isDirectRun =
  Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}
