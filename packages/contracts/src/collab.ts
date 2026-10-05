import { z } from 'zod';

/** Workspace JSON that is committed and synced to teammates. */
export const COLLAB_TEAM_FILES = [
  'collections.json',
  'flows.json',
  'mocks.json',
  'queries.json',
  'load.json',
  'intercept.json',
  'flow-templates.json',
  'plantuml.json',
  'environments.json',
  'database.json',
  'regressions.json',
  'listeners.json',
] as const;

export type CollabTeamFileName = (typeof COLLAB_TEAM_FILES)[number];

/** Files that stay on this PC. `secrets.local.json` is written beside them. */
export const COLLAB_LOCAL_FILES = [
  'history.json',
  'cookies.json',
  'emulator.json',
  'secrets.local.json',
] as const;

/**
 * One repository holds many workspaces. `.collab/local` anywhere holds merge bases and
 * unresolved reviews for this PC only; `.collab/shared` travels with the repository.
 */
export const COLLAB_GITIGNORE = `**/secrets.local.json
**/secrets.local.json.*
**/*.corrupt-*
**/*.tmp
**/history.json
**/cookies.json
**/emulator.json
**/seed-meta.json
**/.collab/local/
`;

/** Lists the workspaces a repository holds. Lives at the repository root. */
export const COLLAB_MANIFEST_FILE = 'testrix.json';

/** Each workspace lives in `workspaces/<folder>/` inside the repository. */
export const COLLAB_WORKSPACES_DIR = 'workspaces';

/**
 * Where a repository written before multi-workspace support puts its root files.
 * Deterministic so every PC that upgrades the same repository agrees.
 */
export const COLLAB_LEGACY_WORKSPACE = { id: 'ws-legacy', folder: 'workspace' } as const;

export const collabSyncStateSchema = z.enum(['idle', 'syncing', 'offline', 'paused', 'attention']);

export type CollabSyncState = z.infer<typeof collabSyncStateSchema>;

export const collabAttentionSchema = z.enum(['none', 'review', 'auth', 'tooling']);

export type CollabAttention = z.infer<typeof collabAttentionSchema>;

export const collabTransportSchema = z.enum(['https', 'ssh']);

export type CollabTransport = z.infer<typeof collabTransportSchema>;

const REF_FORBIDDEN_CHARS = /[\u0000-\u0020\u007f~^:?*[\\]/;

/**
 * Applies `git check-ref-format --branch` rules, so a name can never be read as an
 * option, a revision range, or a path outside `refs/heads`.
 */
export function isValidGitBranchName(name: string): boolean {
  if (!name || name === '@' || name.startsWith('-') || name.startsWith('/') || name.endsWith('/'))
    return false;
  if (name.endsWith('.') || name.endsWith('.lock') || name.includes('..') || name.includes('//') || name.includes('@{'))
    return false;
  if (REF_FORBIDDEN_CHARS.test(name))
    return false;
  return name.split('/').every((part) => part.length > 0 && !part.startsWith('.') && !part.endsWith('.lock'));
}

export const gitBranchNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(isValidGitBranchName, { message: 'Use a valid Git branch name, for example main or team/api.' });

/** A connected repository on this PC. */
export const collabRepoSchema = z.object({
  id: z.string().min(1),
  remoteUrl: z.string().min(1),
  transport: collabTransportSchema,
  branch: gitBranchNameSchema.default('main'),
  sync: z.enum(['auto', 'paused']).default('auto'),
  lastSyncAt: z.string().nullable().default(null),
  lastSyncOid: z.string().nullable().default(null),
});

export type CollabRepo = z.infer<typeof collabRepoSchema>;

/** Links a workspace on this PC to its folder in a connected repository. */
export const workspaceCollabSchema = z.object({
  repoId: z.string().min(1),
  remoteId: z.string().min(1),
});

export type WorkspaceCollab = z.infer<typeof workspaceCollabSchema>;

/** Collab metadata written when every shared workspace was its own repository. */
export const workspaceLegacyCollabSchema = z.object({
  remoteUrl: z.string().min(1),
  transport: collabTransportSchema,
  branch: gitBranchNameSchema.default('main'),
  sync: z.enum(['auto', 'paused']).default('auto'),
  lastSyncAt: z.string().nullable().default(null),
  lastSyncOid: z.string().nullable().default(null),
});

export type WorkspaceLegacyCollab = z.infer<typeof workspaceLegacyCollabSchema>;

export const collabManifestWorkspaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  folder: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
});

export type CollabManifestWorkspace = z.infer<typeof collabManifestWorkspaceSchema>;

export const collabManifestSchema = z.object({
  schemaVersion: z.number().int().positive().default(1),
  workspaces: z.array(collabManifestWorkspaceSchema).default([]),
});

export type CollabManifest = z.infer<typeof collabManifestSchema>;

export interface CollabMember {
  readonly id: string;
  readonly name: string;
  readonly isYou: boolean;
}

export const COLLAB_ACTIVITY_KINDS = ['change', 'run', 'people'] as const;

export type CollabActivityKind = (typeof COLLAB_ACTIVITY_KINDS)[number];

export interface CollabActivity {
  readonly id: string;
  readonly kind: CollabActivityKind;
  readonly author: string;
  readonly summary: string;
  readonly at: string;
  /** Artifact this row points at, when the panel can open it. */
  readonly target?: { readonly kind: CollabChangeKind; readonly id: string };
  /** Repository workspace the row belongs to, when known. */
  readonly workspaceId?: string;
  readonly workspaceName?: string;
}

export interface CollabReview {
  readonly id: string;
  readonly itemId: string;
  readonly label: string;
  readonly file: string;
  readonly summary: string;
  readonly author: string | null;
  readonly at: string | null;
  readonly ours: unknown;
  readonly theirs: unknown;
}

/** Recognizable item kinds, used for the icon beside a change or activity row. */
export const COLLAB_CHANGE_KINDS = [
  'request',
  'websocket',
  'folder',
  'flow',
  'template',
  'environment',
  'database',
  'query',
  'regression',
  'load',
  'mock',
  'listener',
  'intercept',
  'diagram',
  'workspace',
] as const;

export type CollabChangeKind = (typeof COLLAB_CHANGE_KINDS)[number];

export interface CollabChange {
  readonly id: string;
  readonly file: string;
  readonly kind: CollabChangeKind;
  readonly label: string;
  /** Plain words: Added, Updated, or Removed. */
  readonly detail: string;
  readonly author?: string;
}

export interface CollabIdentity {
  readonly name: string;
  readonly email: string;
}

export interface CollabPresence {
  readonly deviceId: string;
  readonly name: string;
  readonly at: string;
  readonly isYou: boolean;
  readonly isActive: boolean;
  /** Workspace this device last reported as open, when known. */
  readonly workspaceName?: string;
}

export interface CollabLock {
  readonly packId: string;
  readonly packName: string;
  readonly owner: string;
  readonly deviceId: string;
  readonly environment: string | null;
  readonly startedAt: string;
  readonly renewedAt: string;
  readonly isMine: boolean;
  readonly isStale: boolean;
  readonly completed: number;
  readonly total: number;
}

export const collabRunStatusSchema = z.enum(['passed', 'failed', 'cancelled', 'running']);

export type CollabRunStatus = z.infer<typeof collabRunStatusSchema>;

export interface CollabRunSummary {
  readonly id: string;
  readonly packId: string;
  readonly packName: string;
  readonly owner: string;
  readonly deviceId: string;
  readonly environment: string | null;
  readonly status: CollabRunStatus;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly durationMs: number;
  readonly passed: number;
  readonly failed: number;
  readonly total: number;
  readonly failedNames: readonly string[];
  readonly isMine: boolean;
}

export interface CollabRepoWorkspace {
  readonly remoteId: string;
  readonly name: string;
  readonly folder: string;
  /** Catalog id when this workspace is on this PC, otherwise null. */
  readonly localId: string | null;
}

export interface CollabRepoSummary {
  readonly id: string;
  readonly remoteUrl: string;
  /** Host, for example `github.com`. */
  readonly label: string;
  readonly repoName: string;
  readonly provider: string | null;
  readonly transport: CollabTransport;
  readonly branch: string;
  readonly sync: 'auto' | 'paused';
  readonly state: CollabSyncState;
  readonly attention: CollabAttention;
  readonly lastSyncAt: string | null;
  readonly lastError: string | null;
  readonly hasCredential: boolean;
  readonly workspaces: readonly CollabRepoWorkspace[];
}

export interface CollabStatus {
  /** Every connected repository, in connection order. */
  readonly repos: readonly CollabRepoSummary[];
  /** Repository the active workspace lives in, or null for a local workspace. */
  readonly activeRepoId: string | null;
  /** The active workspace's id inside that repository. */
  readonly activeRemoteId: string | null;
  readonly kind: 'local' | 'shared';
  readonly state: CollabSyncState;
  readonly attention: CollabAttention;
  readonly lastSyncAt: string | null;
  readonly lastError: string | null;
  /** Host of the remote, for example `github.com`. */
  readonly remoteLabel: string | null;
  readonly remoteUrl: string | null;
  readonly transport: CollabTransport | null;
  readonly provider: string | null;
  readonly branch: string;
  readonly identity: CollabIdentity;
  readonly presenceMode: 'active' | 'offline';
  readonly hasCredential: boolean;
  readonly shareRuns: boolean;
  readonly changes: { readonly mine: readonly CollabChange[]; readonly theirs: readonly CollabChange[] };
  readonly presence: readonly CollabPresence[];
  readonly locks: readonly CollabLock[];
  readonly runs: readonly CollabRunSummary[];
  readonly people: readonly CollabMember[];
  readonly activity: readonly CollabActivity[];
  readonly reviews: readonly CollabReview[];
}

export interface CollabMutationResult<TSnapshot = unknown> {
  readonly status: CollabStatus;
  readonly snapshot: TSnapshot | null;
}

export const collabConnectSchema = z.object({
  url: z.string().min(1),
  username: z.string().optional(),
  password: z.string().optional(),
  branch: gitBranchNameSchema.optional(),
});

export type CollabConnectRequest = z.infer<typeof collabConnectSchema>;

export const collabUpdateCredentialSchema = z.object({
  repoId: z.string().min(1).optional(),
  username: z.string().min(1),
  password: z.string().min(1),
});

export type CollabUpdateCredentialRequest = z.infer<typeof collabUpdateCredentialSchema>;

export interface CollabConnectResult {
  readonly status: CollabStatus;
  readonly repo: CollabRepoSummary;
}

export const collabRepoIdSchema = z.object({
  repoId: z.string().min(1),
});

export const collabAddWorkspacesSchema = z.object({
  repoId: z.string().min(1),
  remoteIds: z.array(z.string().min(1)).min(1),
});

export type CollabAddWorkspacesRequest = z.infer<typeof collabAddWorkspacesSchema>;

export const collabPublishWorkspaceSchema = z.object({
  repoId: z.string().min(1),
  workspaceId: z.string().min(1),
});

export type CollabPublishWorkspaceRequest = z.infer<typeof collabPublishWorkspaceSchema>;

export const collabRemoveFromRepoSchema = z.object({
  repoId: z.string().min(1),
  remoteId: z.string().min(1),
});

export type CollabRemoveFromRepoRequest = z.infer<typeof collabRemoveFromRepoSchema>;

export const collabResolveSchema = z.object({
  id: z.string().min(1),
  choice: z.enum(['ours', 'theirs']),
});

export type CollabResolveRequest = z.infer<typeof collabResolveSchema>;

export const collabIdentitySchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().max(200).optional(),
});

export type CollabIdentityRequest = z.infer<typeof collabIdentitySchema>;

export const collabPresenceModeSchema = z.object({
  mode: z.enum(['active', 'offline']),
});

export const collabShareRunsSchema = z.object({
  enabled: z.boolean(),
});

export const collabBranchSchema = z.object({
  repoId: z.string().min(1).optional(),
  branch: gitBranchNameSchema,
});

export const collabLockRequestSchema = z.object({
  packId: z.string().min(1),
  packName: z.string().min(1),
  environment: z.string().nullable().optional(),
});

export type CollabLockRequest = z.infer<typeof collabLockRequestSchema>;

export const collabLockProgressSchema = z.object({
  packId: z.string().min(1),
  completed: z.number().int().min(0),
  total: z.number().int().min(0),
});

export const collabRunPublishSchema = z.object({
  packId: z.string().min(1),
  packName: z.string().min(1),
  environment: z.string().nullable().optional(),
  status: collabRunStatusSchema,
  startedAt: z.string().min(1),
  finishedAt: z.string().nullable().optional(),
  durationMs: z.number().int().min(0),
  passed: z.number().int().min(0),
  failed: z.number().int().min(0),
  total: z.number().int().min(0),
  failedNames: z.array(z.string()).default([]),
});

export type CollabRunPublishRequest = z.infer<typeof collabRunPublishSchema>;

export interface CollabLockResult {
  readonly ok: boolean;
  readonly lock: CollabLock | null;
  readonly message: string | null;
}

export function defaultCollabIdentity(name: string): CollabIdentity {
  const trimmed = name.trim() || 'Testrix';
  return { name: trimmed, email: `${slugName(trimmed)}@users.testrix.local` };
}

export function localCollabStatus(identityName = 'You'): CollabStatus {
  return {
    repos: [],
    activeRepoId: null,
    activeRemoteId: null,
    kind: 'local',
    state: 'idle',
    attention: 'none',
    lastSyncAt: null,
    lastError: null,
    remoteLabel: null,
    remoteUrl: null,
    transport: null,
    provider: null,
    branch: 'main',
    identity: defaultCollabIdentity(identityName),
    presenceMode: 'active',
    hasCredential: false,
    shareRuns: true,
    changes: { mine: [], theirs: [] },
    presence: [],
    locks: [],
    runs: [],
    people: [],
    activity: [],
    reviews: [],
  };
}

export const collabIdentityDtoSchema = z.object({
  name: z.string(),
  email: z.string(),
});

export const collabChangeSchema = z.object({
  id: z.string(),
  file: z.string(),
  kind: z.enum(COLLAB_CHANGE_KINDS),
  label: z.string(),
  detail: z.string(),
  author: z.string().optional(),
});

export const collabPresenceSchema = z.object({
  deviceId: z.string(),
  name: z.string(),
  at: z.string(),
  isYou: z.boolean(),
  isActive: z.boolean(),
  workspaceName: z.string().optional(),
});

export const collabLockSchema = z.object({
  packId: z.string(),
  packName: z.string(),
  owner: z.string(),
  deviceId: z.string(),
  environment: z.string().nullable(),
  startedAt: z.string(),
  renewedAt: z.string(),
  isMine: z.boolean(),
  isStale: z.boolean(),
  completed: z.number().int(),
  total: z.number().int(),
});

export const collabRunSummarySchema = z.object({
  id: z.string(),
  packId: z.string(),
  packName: z.string(),
  owner: z.string(),
  deviceId: z.string(),
  environment: z.string().nullable(),
  status: collabRunStatusSchema,
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  durationMs: z.number(),
  passed: z.number().int(),
  failed: z.number().int(),
  total: z.number().int(),
  failedNames: z.array(z.string()),
  isMine: z.boolean(),
});

export const collabMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  isYou: z.boolean(),
});

export const collabActivitySchema = z.object({
  id: z.string(),
  kind: z.enum(COLLAB_ACTIVITY_KINDS),
  author: z.string(),
  summary: z.string(),
  at: z.string(),
  target: z.object({ kind: z.enum(COLLAB_CHANGE_KINDS), id: z.string() }).optional(),
  workspaceId: z.string().optional(),
  workspaceName: z.string().optional(),
});

export const collabReviewSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  label: z.string(),
  file: z.string(),
  summary: z.string(),
  author: z.string().nullable(),
  at: z.string().nullable(),
  ours: z.unknown(),
  theirs: z.unknown(),
});

export const collabRepoWorkspaceSchema = z.object({
  remoteId: z.string(),
  name: z.string(),
  folder: z.string(),
  localId: z.string().nullable(),
});

export const collabRepoSummarySchema = z.object({
  id: z.string(),
  remoteUrl: z.string(),
  label: z.string(),
  repoName: z.string(),
  provider: z.string().nullable(),
  transport: collabTransportSchema,
  branch: z.string(),
  sync: z.enum(['auto', 'paused']),
  state: collabSyncStateSchema,
  attention: collabAttentionSchema,
  lastSyncAt: z.string().nullable(),
  lastError: z.string().nullable(),
  hasCredential: z.boolean(),
  workspaces: z.array(collabRepoWorkspaceSchema),
});

export const collabStatusSchema = z.object({
  repos: z.array(collabRepoSummarySchema),
  activeRepoId: z.string().nullable(),
  activeRemoteId: z.string().nullable(),
  kind: z.enum(['local', 'shared']),
  state: collabSyncStateSchema,
  attention: collabAttentionSchema,
  lastSyncAt: z.string().nullable(),
  lastError: z.string().nullable(),
  remoteLabel: z.string().nullable(),
  remoteUrl: z.string().nullable(),
  transport: collabTransportSchema.nullable(),
  provider: z.string().nullable(),
  branch: z.string(),
  identity: collabIdentityDtoSchema,
  presenceMode: z.enum(['active', 'offline']),
  hasCredential: z.boolean(),
  shareRuns: z.boolean(),
  changes: z.object({
    mine: z.array(collabChangeSchema),
    theirs: z.array(collabChangeSchema),
  }),
  presence: z.array(collabPresenceSchema),
  locks: z.array(collabLockSchema),
  runs: z.array(collabRunSummarySchema),
  people: z.array(collabMemberSchema),
  activity: z.array(collabActivitySchema),
  reviews: z.array(collabReviewSchema),
});

export function parseCollabStatus(raw: unknown): CollabStatus {
  return collabStatusSchema.parse(raw);
}

export function isSharedWorkspace(item: { readonly kind?: 'local' | 'shared' } | null | undefined): boolean {
  return item?.kind === 'shared';
}

/** Repository-relative path of one file inside a workspace folder. */
export function collabWorkspacePath(folder: string, file: string): string {
  return `${COLLAB_WORKSPACES_DIR}/${folder}/${file}`;
}

/** Splits `workspaces/<folder>/<file>` back apart. Returns null for any other path. */
export function parseCollabWorkspacePath(
  repoPath: string,
): { readonly folder: string; readonly file: string } | null {
  const match = /^workspaces\/([a-z0-9][a-z0-9-]*)\/(.+)$/.exec(repoPath);
  if (!match)
    return null;
  return { folder: match[1] ?? '', file: match[2] ?? '' };
}

/** True for a team JSON file at `workspaces/<folder>/<team file>`. */
export function isCollabTeamPath(repoPath: string): boolean {
  const parsed = parseCollabWorkspacePath(repoPath);
  return Boolean(parsed && (COLLAB_TEAM_FILES as readonly string[]).includes(parsed.file));
}

/** A folder name for a new workspace in a repository, unique against `taken`. */
export function collabFolderSlug(name: string, taken: readonly string[] = []): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'workspace';
  const used = new Set(taken);
  if (!used.has(base))
    return base;
  let n = 2;
  while (used.has(`${base}-${n}`))
    n += 1;
  return `${base}-${n}`;
}

export function parseCollabManifest(raw: unknown): CollabManifest {
  const parsed = collabManifestSchema.safeParse(raw);
  if (!parsed.success)
    return { schemaVersion: 1, workspaces: [] };
  const seenIds = new Set<string>();
  const seenFolders = new Set<string>();
  const workspaces = parsed.data.workspaces.filter((entry) => {
    if (seenIds.has(entry.id) || seenFolders.has(entry.folder))
      return false;
    seenIds.add(entry.id);
    seenFolders.add(entry.folder);
    return true;
  });
  return { schemaVersion: parsed.data.schemaVersion, workspaces };
}

/**
 * Three-way merge of the workspace list, by id. Additions on either side survive;
 * a removal wins only when the other side left that entry untouched.
 */
export function mergeCollabManifest(
  base: CollabManifest | null,
  ours: CollabManifest,
  theirs: CollabManifest,
): CollabManifest {
  const baseById = new Map((base?.workspaces ?? []).map((entry) => [entry.id, entry]));
  const oursById = new Map(ours.workspaces.map((entry) => [entry.id, entry]));
  const theirsById = new Map(theirs.workspaces.map((entry) => [entry.id, entry]));
  const order = [...new Set([...ours.workspaces.map((entry) => entry.id), ...theirs.workspaces.map((entry) => entry.id)])];
  const merged: CollabManifestWorkspace[] = [];
  const folders = new Set<string>();
  for (const id of order) {
    const was = baseById.get(id);
    const mine = oursById.get(id);
    const other = theirsById.get(id);
    let pick: CollabManifestWorkspace | undefined;
    if (mine && other)
      pick = was && sameEntry(mine, was) ? other : mine;
    else if (mine)
      pick = was && sameEntry(mine, was) ? undefined : mine;
    else if (other)
      pick = was && sameEntry(other, was) ? undefined : other;
    if (!pick || folders.has(pick.folder))
      continue;
    folders.add(pick.folder);
    merged.push(pick);
  }
  return { schemaVersion: Math.max(ours.schemaVersion, theirs.schemaVersion, 1), workspaces: merged };
}

function sameEntry(left: CollabManifestWorkspace, right: CollabManifestWorkspace): boolean {
  return left.id === right.id && left.name === right.name && left.folder === right.folder;
}

/**
 * Reads a single-workspace repository as if it were already organized: root team files,
 * locks, and runs move under `workspaces/workspace/`. Presence stays repository-wide.
 * Repositories with a manifest pass through untouched.
 */
export function upgradeLegacyCollabFiles(
  files: Readonly<Record<string, string>>,
  workspaceName: string,
): { readonly files: Record<string, string>; readonly isLegacy: boolean } {
  if (files[COLLAB_MANIFEST_FILE] !== undefined)
    return { files: { ...files }, isLegacy: false };
  const teamFiles = COLLAB_TEAM_FILES as readonly string[];
  const hasRootTeamFile = Object.keys(files).some((file) => teamFiles.includes(file));
  if (!hasRootTeamFile)
    return { files: { ...files }, isLegacy: false };
  const { folder, id } = COLLAB_LEGACY_WORKSPACE;
  const next: Record<string, string> = {};
  for (const [file, text] of Object.entries(files)) {
    if (teamFiles.includes(file))
      next[collabWorkspacePath(folder, file)] = text;
    else if (/^\.collab\/shared\/(locks|runs)\//.test(file))
      next[collabWorkspacePath(folder, file)] = text;
    else
      next[file] = text;
  }
  const manifest: CollabManifest = {
    schemaVersion: 1,
    workspaces: [{ id, name: workspaceName.trim() || 'Workspace', folder }],
  };
  next[COLLAB_MANIFEST_FILE] = `${JSON.stringify(manifest, null, 2)}\n`;
  return { files: next, isLegacy: true };
}

/** Trailer that ties a commit to the workspaces it touched, so activity can filter. */
export const COLLAB_WORKSPACE_TRAILER = 'Testrix-Workspace';

export function collabCommitBody(workspaceIds: readonly string[]): string {
  return workspaceIds.map((id) => `${COLLAB_WORKSPACE_TRAILER}: ${id}`).join('\n');
}

export function readCollabCommitWorkspaces(message: string): string[] {
  const ids: string[] = [];
  const pattern = new RegExp(`^${COLLAB_WORKSPACE_TRAILER}:\\s*(\\S+)\\s*$`, 'gm');
  for (const match of message.matchAll(pattern)) {
    if (match[1])
      ids.push(match[1]);
  }
  return ids;
}

const FILE_LABEL: Record<string, string> = {
  'collections.json': 'collections',
  'flows.json': 'flows',
  'mocks.json': 'mocks',
  'queries.json': 'queries',
  'load.json': 'load tests',
  'intercept.json': 'intercept rules',
  'flow-templates.json': 'flow templates',
  'plantuml.json': 'diagrams',
  'environments.json': 'environments',
  'database.json': 'database connections',
  'regressions.json': 'regressions',
  'listeners.json': 'listeners',
};

const FILE_KIND: Record<string, CollabChangeKind> = {
  'collections.json': 'request',
  'flows.json': 'flow',
  'mocks.json': 'mock',
  'queries.json': 'query',
  'load.json': 'load',
  'intercept.json': 'intercept',
  'flow-templates.json': 'template',
  'plantuml.json': 'diagram',
  'environments.json': 'environment',
  'database.json': 'database',
  'regressions.json': 'regression',
  'listeners.json': 'listener',
};

/** Item kind for a team file path such as `workspaces/api/collections.json`. */
export function collabChangeKindFromFile(file: string): CollabChangeKind {
  const name = file.split('/').pop() ?? file;
  return FILE_KIND[name] ?? 'workspace';
}

/**
 * Automatic commit subject from the team files that changed.
 */
export function collabCommitMessage(files: readonly string[]): string {
  const labels = files.map((file) => FILE_LABEL[file] ?? 'workspace');
  if (labels.length === 0)
    return 'Updated workspace';
  if (labels.length === 1)
    return `Updated ${labels[0]}`;
  if (labels.length === 2)
    return `Updated ${labels[0]} and ${labels[1]}`;
  return `Updated ${labels[0]} and ${labels.length - 1} more`;
}

/**
 * One activity row, addressed as "You" when the author matches the local identity.
 */
export function collabActivitySummary(author: string, message: string, you: string | null): string {
  const who = you && author.trim() === you.trim() ? 'You' : author.trim() || 'Someone';
  const action = message.trim() || 'updated the workspace';
  const lower = action.charAt(0).toLowerCase() + action.slice(1);
  return `${who} ${lower}`;
}

export interface ParsedGitRemote {
  readonly url: string;
  readonly transport: CollabTransport;
  readonly host: string;
  readonly provider: string | null;
  readonly repo: string;
}

const PROVIDERS: readonly { readonly match: RegExp; readonly label: string }[] = [
  { match: /(^|\.)github\.com$/i, label: 'GitHub' },
  { match: /(^|\.)gitlab\./i, label: 'GitLab' },
  { match: /(^|\.)bitbucket\.org$/i, label: 'Bitbucket' },
  { match: /(^|\.)dev\.azure\.com$/i, label: 'Azure DevOps' },
  { match: /(^|\.)visualstudio\.com$/i, label: 'Azure DevOps' },
  { match: /(^|\.)gitea\./i, label: 'Gitea' },
  { match: /(^|\.)sourcehut\.org$/i, label: 'SourceHut' },
];

/**
 * Reads an HTTPS or SSH repository address. Returns null when the text is not a Git remote.
 */
export function parseGitRemote(raw: string): ParsedGitRemote | null {
  const text = raw.trim().replace(/\/+$/, '');
  if (!text)
    return null;
  const scp = /^(?:ssh:\/\/)?([^@\s]+)@([^:/\s]+)(?::(\d+))?[:/](.+)$/.exec(text);
  if (scp && !/^https?:\/\//i.test(text)) {
    const host = scp[2] ?? '';
    return {
      url: text,
      transport: 'ssh',
      host,
      provider: providerFor(host),
      repo: repoName(scp[4] ?? ''),
    };
  }
  try {
    const url = new URL(text);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return {
        url: text,
        transport: 'https',
        host: url.host,
        provider: providerFor(url.hostname),
        repo: repoName(url.pathname),
      };
    }
    if (url.protocol === 'ssh:') {
      return {
        url: text,
        transport: 'ssh',
        host: url.host,
        provider: providerFor(url.hostname),
        repo: repoName(url.pathname),
      };
    }
  } catch {
    return null;
  }
  return null;
}

function providerFor(host: string): string | null {
  return PROVIDERS.find((entry) => entry.match.test(host))?.label ?? null;
}

function repoName(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  return last.replace(/\.git$/i, '');
}

function slugName(name: string): string {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
  return cleaned || 'teammate';
}

/** Most changes a single file contributes to the panel. */
const CHANGE_LIMIT_PER_FILE = 8;

interface NamedNode {
  readonly id: string;
  readonly label: string;
  readonly kind: CollabChangeKind;
  readonly parents: readonly string[];
  readonly json: string;
}

/**
 * Names what changed between two versions of a team file, deepest item first.
 * Falls back to the file label when a document has no identified nodes.
 */
export function collabChangeSummary(
  fileName: string,
  base: unknown,
  next: unknown,
  author?: string,
): CollabChange[] {
  const fallbackKind = FILE_KIND[fileName] ?? 'workspace';
  const before = new Map<string, NamedNode>();
  const after = new Map<string, NamedNode>();
  collectNamed(base, fallbackKind, [], before);
  collectNamed(next, fallbackKind, [], after);
  const touched: { readonly node: NamedNode; readonly detail: string }[] = [];
  for (const [id, node] of after) {
    const previous = before.get(id);
    if (!previous)
      touched.push({ node, detail: 'Added' });
    else if (previous.json !== node.json)
      touched.push({ node, detail: 'Updated' });
  }
  for (const [id, node] of before) {
    if (!after.has(id))
      touched.push({ node, detail: 'Removed' });
  }
  if (touched.length === 0) {
    if (stableJson(base) === stableJson(next))
      return [];
    return [
      {
        id: fileName,
        file: fileName,
        kind: fallbackKind,
        label: capitalize(FILE_LABEL[fileName] ?? 'workspace'),
        detail: 'Updated',
        ...(author ? { author } : {}),
      },
    ];
  }
  const deepest = touched.filter(
    (entry) => !touched.some((other) => other.node.id !== entry.node.id && other.node.parents.includes(entry.node.id)),
  );
  return deepest.slice(0, CHANGE_LIMIT_PER_FILE).map((entry) => ({
    id: `${fileName}:${entry.node.id}`,
    file: fileName,
    kind: entry.node.kind,
    label: entry.node.label,
    detail: entry.detail,
    ...(author ? { author } : {}),
  }));
}

function collectNamed(
  value: unknown,
  fallbackKind: CollabChangeKind,
  parents: readonly string[],
  into: Map<string, NamedNode>,
): void {
  if (Array.isArray(value)) {
    for (const entry of value)
      collectNamed(entry, fallbackKind, parents, into);
    return;
  }
  if (!value || typeof value !== 'object')
    return;
  const record = value as Record<string, unknown>;
  const id = typeof record['id'] === 'string' ? record['id'] : null;
  const label = nodeLabel(record);
  const nextParents = id && label ? [...parents, id] : parents;
  if (id && label) {
    into.set(id, {
      id,
      label,
      kind: nodeKind(record, fallbackKind),
      parents,
      json: stableJson(record),
    });
  }
  for (const child of Object.values(record))
    collectNamed(child, fallbackKind, nextParents, into);
}

function nodeLabel(record: Record<string, unknown>): string | null {
  for (const key of ['name', 'title', 'key', 'label']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim())
      return value.trim();
  }
  return null;
}

function nodeKind(record: Record<string, unknown>, fallback: CollabChangeKind): CollabChangeKind {
  const kind = record['kind'];
  if (kind === 'folder')
    return 'folder';
  if (kind === 'http')
    return 'request';
  if (kind === 'websocket')
    return 'websocket';
  if (kind === 'variable')
    return 'environment';
  if (kind === 'connection')
    return 'database';
  return fallback;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map((entry) => sortDeep(entry));
  if (!value || typeof value !== 'object')
    return value ?? null;
  const record = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort())
    next[key] = sortDeep(record[key]);
  return next;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Drops run logs and listener activity before a team file is synced.
 */
export function stripCollabArtifacts(fileName: string, value: unknown): unknown {
  if (fileName !== 'listeners.json' && fileName !== 'load.json' && fileName !== 'regressions.json')
    return value;
  return stripRunsAndActivity(value);
}

/**
 * Copies local run logs and listener activity back onto a merged team file.
 */
export function restoreCollabArtifacts(fileName: string, merged: unknown, local: unknown): unknown {
  if (fileName !== 'listeners.json' && fileName !== 'load.json' && fileName !== 'regressions.json')
    return merged;
  const localById = new Map<string, { readonly runs?: unknown; readonly activity?: unknown }>();
  collectArtifacts(local, localById);
  return restoreArtifacts(merged, localById);
}

function stripRunsAndActivity(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map((entry) => stripRunsAndActivity(entry));
  if (!value || typeof value !== 'object')
    return value;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if ((key === 'runs' || key === 'activity') && Array.isArray(child))
      next[key] = [];
    else
      next[key] = stripRunsAndActivity(child);
  }
  return next;
}

function collectArtifacts(
  value: unknown,
  into: Map<string, { readonly runs?: unknown; readonly activity?: unknown }>,
): void {
  if (Array.isArray(value)) {
    for (const entry of value)
      collectArtifacts(entry, into);
    return;
  }
  if (!value || typeof value !== 'object')
    return;
  const record = value as Record<string, unknown>;
  if (typeof record['id'] === 'string' && (Array.isArray(record['runs']) || Array.isArray(record['activity']))) {
    into.set(record['id'], {
      runs: record['runs'],
      activity: record['activity'],
    });
  }
  for (const child of Object.values(record))
    collectArtifacts(child, into);
}

function restoreArtifacts(
  value: unknown,
  localById: ReadonlyMap<string, { readonly runs?: unknown; readonly activity?: unknown }>,
): unknown {
  if (Array.isArray(value))
    return value.map((entry) => restoreArtifacts(entry, localById));
  if (!value || typeof value !== 'object')
    return value;
  const record = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record))
    next[key] = restoreArtifacts(child, localById);
  if (typeof record['id'] === 'string') {
    const local = localById.get(record['id']);
    if (local?.runs !== undefined)
      next['runs'] = local.runs;
    if (local?.activity !== undefined)
      next['activity'] = local.activity;
  }
  return next;
}
