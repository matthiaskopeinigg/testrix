import { describe, expect, it } from 'vitest';

import { toTreeNodes } from './environment-tree.adapter';
import { ENVIRONMENT_SCOPE_FIXTURE } from './environment-tree.fixture';
import {
  createEnvironmentFolder,
  createEnvironmentVariable,
  deleteEnvironmentNode,
  findEnvironmentNode,
} from './environment-tree.mutations';

describe('environment-tree.mutations', () => {
  it('creates variables at root and inside folders', () => {
    const root = toTreeNodes(ENVIRONMENT_SCOPE_FIXTURE);
    const withFolder = createEnvironmentFolder(root, null, 'Secrets');
    expect(withFolder).not.toBeNull();
    const folderId = withFolder!.nodeId;
    const inFolder = createEnvironmentVariable(withFolder!.nodes, folderId, 'apiKey');
    expect(inFolder).not.toBeNull();
    const loc = findEnvironmentNode(inFolder!.nodes, inFolder!.nodeId);
    expect(loc?.parent?.id).toBe(folderId);

    const atRoot = createEnvironmentVariable(inFolder!.nodes, null, 'rootVar');
    expect(atRoot).not.toBeNull();
    const rootLoc = findEnvironmentNode(atRoot!.nodes, atRoot!.nodeId);
    expect(rootLoc?.parent).toBeNull();
  });

  it('deletes folder and its variables', () => {
    const root = toTreeNodes(ENVIRONMENT_SCOPE_FIXTURE);
    const withFolder = createEnvironmentFolder(root, null, 'Temp');
    expect(withFolder).not.toBeNull();
    const folderId = withFolder!.nodeId;
    createEnvironmentVariable(withFolder!.nodes, folderId, 'x');

    const next = deleteEnvironmentNode(withFolder!.nodes, folderId);
    expect(next).not.toBeNull();
    expect(findEnvironmentNode(next!, folderId)).toBeNull();
  });
});
