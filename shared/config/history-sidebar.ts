import { z } from 'zod';

/** Status bucket filter for the history sidebar list. */
export const HISTORY_SIDEBAR_STATUS_FILTER_IDS = [
  'all',
  'success',
  'redirect',
  'client-error',
  'server-error',
  'no-response',
] as const;

export type HistorySidebarStatusFilter = (typeof HISTORY_SIDEBAR_STATUS_FILTER_IDS)[number];

export const HISTORY_SIDEBAR_SORT_BY_IDS = [
  'date-new',
  'date-old',
  'method-asc',
  'method-desc',
  'status-asc',
  'status-desc',
] as const;

export type HistorySidebarSortBy = (typeof HISTORY_SIDEBAR_SORT_BY_IDS)[number];

export const DEFAULT_HISTORY_SIDEBAR_STATUS_FILTER: HistorySidebarStatusFilter = 'all';

export const DEFAULT_HISTORY_SIDEBAR_SORT_BY: HistorySidebarSortBy = 'date-new';

export const workspaceHistorySidebarSchema = z.object({
  statusFilter: z
    .enum(HISTORY_SIDEBAR_STATUS_FILTER_IDS)
    .default(DEFAULT_HISTORY_SIDEBAR_STATUS_FILTER),
  sortBy: z.enum(HISTORY_SIDEBAR_SORT_BY_IDS).default(DEFAULT_HISTORY_SIDEBAR_SORT_BY),
  collapsedByDate: z.record(z.string(), z.boolean()).default({}),
});

export type WorkspaceHistorySidebar = z.infer<typeof workspaceHistorySidebarSchema>;
