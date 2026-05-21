import type { EnvironmentDefinition, EnvironmentScopeNode } from '@shared/config';

function countVariablesInNodes(nodes: readonly EnvironmentScopeNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.kind === 'variable') {
      count += 1;
      continue;
    }
    if (node.children.length > 0) {
      count += countVariablesInNodes(node.children);
    }
  }
  return count;
}

/** Whether an environment definition contains at least one variable. */
export function environmentHasVariables(environment: EnvironmentDefinition): boolean {
  return countVariablesInNodes(environment.nodes) > 0;
}
