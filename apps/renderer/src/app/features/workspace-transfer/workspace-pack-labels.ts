import {
  PACK_DEEP_TREE_CATEGORIES,
  PACK_EXPORT_TREE_CATEGORIES,
  WORKSPACE_PACK_CATEGORY_KEYS,
  WORKSPACE_PACK_EXPORT_CATEGORY_KEYS,
  type PackCategory,
  type PackExportCategory,
} from '@testrix/contracts';

export const PACK_CATEGORY_LABELS: Record<PackCategory, string> = {
  collections: 'Collections',
  flows: 'Flows',
  mocks: 'Mocks',
  environments: 'Environments',
  database: 'Database',
  queries: 'Queries',
  history: 'History',
  cookies: 'Cookies',
  load: 'Load',
  listeners: 'Listeners',
  intercept: 'Interceptor',
  regressions: 'Regressions',
  emulator: 'Emulator',
  'flow-templates': 'Flow templates',
  plantuml: 'PlantUML',
};

export const PACK_CATEGORY_OPTIONS = WORKSPACE_PACK_CATEGORY_KEYS.map((id) => ({
  id,
  label: PACK_CATEGORY_LABELS[id],
  deepTree: PACK_DEEP_TREE_CATEGORIES.has(id),
}));

/** Categories shown in Export (omits history, cookies, listeners, emulator, plantuml). */
export const PACK_EXPORT_CATEGORY_OPTIONS = WORKSPACE_PACK_EXPORT_CATEGORY_KEYS.map((id) => ({
  id,
  label: PACK_CATEGORY_LABELS[id],
  deepTree: PACK_EXPORT_TREE_CATEGORIES.has(id),
}));

export function isDeepTreeCategory(category: string): category is PackCategory {
  return PACK_DEEP_TREE_CATEGORIES.has(category as PackCategory);
}

export function isExportTreeCategory(category: string): category is PackExportCategory {
  return PACK_EXPORT_TREE_CATEGORIES.has(category as PackExportCategory);
}
