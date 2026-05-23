import {
  findEnvironmentVariableNodeId,
  findEnvironmentVariableNodeIdInProfiles,
  type EnvironmentDefinition,
  type EnvironmentVariableKeyOptions,
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
  keyOptions?: EnvironmentVariableKeyOptions,
): boolean {
  const trimmed = key.trim();
  if (trimmed.length === 0) {
    return false;
  }

  let nodeId: string | null = null;
  if (environmentId) {
    const environment = environments.find((entry) => entry.id === environmentId) ?? null;
    nodeId = findEnvironmentVariableNodeId(environment, trimmed, keyOptions);
  }
  if (!nodeId) {
    nodeId = findEnvironmentVariableNodeIdInProfiles(environments, trimmed, keyOptions);
  }
  if (!nodeId) {
    return false;
  }

  workspaceEditor.openResource({ resourceId: nodeId, kind: 'environment' });
  return true;
}
