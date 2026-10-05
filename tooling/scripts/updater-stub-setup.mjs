#!/usr/bin/env node
/**
 * Stands in for Testrix.exe --silent-update during a stubbed updater run.
 * Writes a marker into the fake install folder and the same log Setup would append.
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function readValue(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  const value = hit?.slice(prefix.length).trim();
  return value || null;
}

const installDir = readValue('install-dir');
const logFile = readValue('log-file');
const updatedFrom = readValue('updated-from');

function log(line) {
  if (!logFile) return;
  mkdirSync(path.dirname(logFile), { recursive: true });
  appendFileSync(logFile, `${new Date().toISOString()} ${line}\r\n`, 'utf8');
}

if (!installDir) {
  console.error('updater-stub-setup: missing --install-dir');
  process.exit(1);
}

mkdirSync(installDir, { recursive: true });
const marker = {
  appliedAt: new Date().toISOString(),
  updatedFrom,
  args: process.argv.slice(2),
};
writeFileSync(path.join(installDir, 'update-applied.json'), `${JSON.stringify(marker, null, 2)}\n`);
log(`Stub installer applied an update over ${updatedFrom ?? 'unknown'}.`);
log('Swap finished.');
console.log(`updater-stub-setup: wrote ${path.join(installDir, 'update-applied.json')}`);
