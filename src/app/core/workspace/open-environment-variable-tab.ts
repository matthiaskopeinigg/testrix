import {
  findEnvironmentVariableNodeId,
  findEnvironmentVariableNodeIdInProfiles,
  type EnvironmentDefinition,
} from '@shared/config';

import type { WorkspaceEditorService } from './workspace-editor.service';

/**
 * Opens an environment workspace tab focused on the variable with the given key.
 *
 * @returns true when a matching variable node was found.
 */
export function openEnvironmentVariableTab(
  workspaceEditor: WorkspaceEditorService,
  environments: readonly EnvironmentDefinition[],
  key: string,
  environmentId?: string | null,
): boolean {
  const trimmed = key.trim();
  if (trimmed.length === 0) {
    return false;
  }

  let nodeId: string | null = null;
  if (environmentId) {
    const environment = environments.find((entry) => entry.id === environmentId) ?? null;
    nodeId = findEnvironmentVariableNodeId(environment, trimmed);
  }
  if (!nodeId) {
    nodeId = findEnvironmentVariableNodeIdInProfiles(environments, trimmed);
  }
  if (!nodeId) {
    return false;
  }

  workspaceEditor.openResource({ resourceId: nodeId, kind: 'environment' });
  return true;
}
