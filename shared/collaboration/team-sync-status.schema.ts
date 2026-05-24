import { z } from 'zod';

import { teamGitAuthMethodSchema } from './team-git-setup.schema';

export const teamSyncStatusIdSchema = z.enum([
  'not-configured',
  'idle',
  'synced',
  'syncing',
  'offline',
  'failed',
  'conflict',
  'dirty',
]);

export type TeamSyncStatusId = z.infer<typeof teamSyncStatusIdSchema>;

export const teamSyncStatusSchema = z.object({
  status: teamSyncStatusIdSchema,
  branch: z.string().nullable(),
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  lastSyncedAt: z.string().nullable(),
  lastError: z.string().nullable(),
  operation: z.string().nullable(),
  pendingPush: z.boolean(),
  gitAvailable: z.boolean(),
  repoDetected: z.boolean(),
  authMethod: teamGitAuthMethodSchema,
  authReady: z.boolean(),
  conflictedFiles: z.array(z.string()),
});

export type TeamSyncStatus = z.infer<typeof teamSyncStatusSchema>;

export function createDefaultTeamSyncStatus(): TeamSyncStatus {
  return {
    status: 'not-configured',
    branch: null,
    ahead: 0,
    behind: 0,
    lastSyncedAt: null,
    lastError: null,
    operation: null,
    pendingPush: false,
    gitAvailable: false,
    repoDetected: false,
    authMethod: 'none',
    authReady: false,
    conflictedFiles: [],
  };
}

export interface TeamSyncStatusDerivationInput {
  readonly current: Pick<TeamSyncStatus, 'status' | 'lastSyncedAt'>;
  readonly enabled: boolean;
  readonly remoteUrl: string | null;
  readonly primaryPending: number;
  readonly anyPending: boolean;
}

/**
 * Derives a stable public sync status id from repo metadata without downgrading terminal states.
 */
export function deriveTeamSyncStatusId(input: TeamSyncStatusDerivationInput): TeamSyncStatusId {
  const { current, enabled, remoteUrl, primaryPending, anyPending } = input;

  if (!enabled || !remoteUrl) {
    return 'not-configured';
  }
  if (current.status === 'syncing') {
    return 'syncing';
  }
  if (primaryPending > 0 || anyPending) {
    return 'dirty';
  }
  if (current.status === 'conflict' || current.status === 'failed' || current.status === 'offline') {
    return current.status;
  }
  if (current.status === 'synced' || current.lastSyncedAt) {
    return 'synced';
  }
  return 'idle';
}

export function teamSyncStatusLabel(
  status: TeamSyncStatusId,
  options?: { readonly autoSyncPaused?: boolean },
): string {
  if (options?.autoSyncPaused && status !== 'syncing') {
    return 'Paused';
  }
  switch (status) {
    case 'synced':
      return 'Synced';
    case 'syncing':
      return 'Syncing…';
    case 'offline':
      return 'Offline';
    case 'failed':
      return 'Sync failed';
    case 'conflict':
      return 'Conflict';
    case 'dirty':
      return 'Pending changes';
    case 'idle':
      return 'Connected';
    default:
      return 'Not connected';
  }
}
