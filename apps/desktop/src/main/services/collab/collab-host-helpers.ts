import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  COLLAB_LOCAL_DIR,
  COLLAB_MANIFEST_FILE,
  COLLAB_WORKSPACES_DIR,
  parseCollabManifest,
  type CollabManifest,
  type CollabMember,
  type CollabPresence,
  type CollabRunSummary,
  type CollabReview,
} from '@testrix/contracts';

import { parseJsonText, readJsonFile } from '../json-file';

export function manifestNote(
  base: CollabManifest | null,
  ours: CollabManifest,
  theirs: CollabManifest | null,
): { readonly subject: string; readonly ids: string[] } | null {
  const baseById = new Map((base?.workspaces ?? []).map((entry) => [entry.id, entry]));
  const oursIds = new Set(ours.workspaces.map((entry) => entry.id));
  const theirsIds = new Set((theirs?.workspaces ?? []).map((entry) => entry.id));
  const added = ours.workspaces.filter((entry) => !baseById.has(entry.id) && !theirsIds.has(entry.id));
  if (added.length > 0)
    return { subject: `Published ${listNames(added.map((entry) => entry.name))}`, ids: added.map((entry) => entry.id) };
  const removed = (base?.workspaces ?? []).filter((entry) => !oursIds.has(entry.id));
  if (removed.length > 0) {
    return {
      subject: `Removed ${listNames(removed.map((entry) => entry.name))} from the repository`,
      ids: removed.map((entry) => entry.id),
    };
  }
  const renamed = ours.workspaces.filter((entry) => {
    const was = baseById.get(entry.id);
    return was !== undefined && was.name !== entry.name;
  });
  const first = renamed[0];
  if (first)
    return { subject: `Renamed ${baseById.get(first.id)?.name ?? 'a workspace'} to ${first.name}`, ids: [first.id] };
  return null;
}

export function listNames(names: readonly string[]): string {
  if (names.length <= 1)
    return names[0] ?? 'a workspace';
  return `${names[0]} and ${names.length - 1} more`;
}

export function credentialHint(transport: 'https' | 'ssh'): string {
  return transport === 'ssh'
    ? 'That server did not accept this PC. Check your SSH key, then try again.'
    : 'Update the access token to keep syncing.';
}

export function runActivityLine(run: CollabRunSummary, you: string): string {
  const who = run.owner === you ? 'You' : run.owner;
  if (run.status === 'cancelled')
    return `${who} stopped ${run.packName}`;
  if (run.status === 'running')
    return `${who} is running ${run.packName}`;
  if (run.failed > 0)
    return `${who} finished ${run.packName}, ${run.failed} failed`;
  return `${who} finished ${run.packName}, all passed`;
}

export function peopleFrom(
  presence: readonly CollabPresence[],
  runs: readonly CollabRunSummary[],
  you: string,
): CollabMember[] {
  const byName = new Map<string, CollabMember>();
  for (const entry of presence)
    byName.set(entry.name, { id: entry.deviceId, name: entry.name, isYou: entry.isYou });
  for (const run of runs) {
    if (!byName.has(run.owner))
      byName.set(run.owner, { id: run.deviceId, name: run.owner, isYou: run.owner === you });
  }
  if (!byName.has(you))
    byName.set(you, { id: 'you', name: you, isYou: true });
  return [...byName.values()];
}

export async function readManifest(dir: string): Promise<CollabManifest> {
  return parseCollabManifest(await readJsonFile(path.join(dir, COLLAB_MANIFEST_FILE)));
}

export async function writeManifest(dir: string, manifest: CollabManifest): Promise<void> {
  const filePath = path.join(dir, COLLAB_MANIFEST_FILE);
  const next = `${JSON.stringify(manifest, null, 2)}\n`;
  if ((await readText(filePath)) === next)
    return;
  await writeFile(filePath, next, 'utf8');
}

/** Workspace folders present in a clone. */
export async function listFolders(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(path.join(dir, COLLAB_WORKSPACES_DIR), { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

export async function readText(filePath: string): Promise<string | null> {
  if (!existsSync(filePath))
    return null;
  return readFile(filePath, 'utf8');
}

export async function readBaseFile(dir: string, repoPath: string): Promise<string | null> {
  return readText(path.join(dir, ...COLLAB_LOCAL_DIR.split('/'), 'base', ...repoPath.split('/')));
}

export function canonical(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text) as unknown);
  } catch {
    return text;
  }
}

export function parseJson(text: string | null | undefined): unknown {
  return parseJsonText(text, {});
}

export function dedupeReviews(reviews: readonly CollabReview[]): CollabReview[] {
  const seen = new Set<string>();
  const next: CollabReview[] = [];
  for (const review of reviews) {
    if (seen.has(review.id))
      continue;
    seen.add(review.id);
    next.push(review);
  }
  return next;
}
