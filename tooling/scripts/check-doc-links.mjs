#!/usr/bin/env node
/**
 * Verifies relative Markdown links in README.md and docs/*.md resolve to existing files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const MARKDOWN_LINK = /\[[^\]]*\]\(([^)]+)\)/g;
const SKIP_PREFIXES = ['http://', 'https://', 'mailto:', '#'];

function collectMarkdownFiles() {
  const files = [];
  for (const name of [
    'README.md',
    'CHANGELOG.md',
    'CONTRIBUTING.md',
    'SECURITY.md',
    'CODE_OF_CONDUCT.md',
  ]) {
    const file = path.join(repoRoot, name);
    if (fs.existsSync(file)) files.push(file);
  }
  const docsDir = path.join(repoRoot, 'docs');
  if (!fs.existsSync(docsDir)) return files;
  for (const name of fs.readdirSync(docsDir)) {
    if (name.endsWith('.md')) files.push(path.join(docsDir, name));
  }
  return files;
}

function extractMdLinks(markdown) {
  const links = [];
  for (const match of markdown.matchAll(MARKDOWN_LINK)) {
    const raw = match[1].trim();
    if (!raw || SKIP_PREFIXES.some((prefix) => raw.startsWith(prefix))) continue;
    const withoutAnchor = raw.split('#')[0];
    if (!withoutAnchor || !withoutAnchor.toLowerCase().endsWith('.md')) continue;
    links.push(withoutAnchor);
  }
  return links;
}

function resolveLink(fromFile, linkPath) {
  const baseDir = path.dirname(fromFile);
  return path.normalize(path.join(baseDir, linkPath));
}

const errors = [];

for (const file of collectMarkdownFiles()) {
  const content = fs.readFileSync(file, 'utf8');
  const relFile = path.relative(repoRoot, file);
  for (const link of extractMdLinks(content)) {
    const target = resolveLink(file, link);
    if (!fs.existsSync(target))
      errors.push(`${relFile}: broken link \`${link}\` → ${path.relative(repoRoot, target)}`);
  }
}

if (errors.length > 0) {
  console.error('Documentation link check failed:\n');
  for (const line of errors) console.error(`  - ${line}`);
  process.exit(1);
}

console.log('Documentation links OK.');
