import type { WorkspaceTabKind } from '@shared/config';

import type { TxIconName } from '@app/shared/icons';

const WORKSPACE_TAB_KIND_ICONS: Record<WorkspaceTabKind, TxIconName> = {
  request: 'http',
  history: 'clock',
  folder: 'folder',
  websocket: 'zap',
  environment: 'globe',
  'design-system': 'grid',
  'dev-tool': 'development',
  'test-suite': 'testing',
  'load-test': 'zap',
  regression: 'target',
  'mock-server': 'api',
  capture: 'globe',
  'interceptor-rule': 'interceptor',
};

/**
 * Default sidebar/tree icon for a workspace editor tab kind.
 */
export function iconForWorkspaceTabKind(kind: WorkspaceTabKind): TxIconName {
  return WORKSPACE_TAB_KIND_ICONS[kind];
}
