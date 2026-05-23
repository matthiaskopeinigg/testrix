import type { WorkspaceTabKind } from '@shared/config';

export const MOCK_SERVER_HUB_TAB_ID = '__mock_server__' as const;

/**
 * Returns whether a workspace tab id is a persisted mock-server editor tab (`ms:` prefix).
 */
export function isPersistedMockServerTabId(resourceId: string): boolean {
  return (
    (resourceId.startsWith('ms:') && resourceId !== MOCK_SERVER_HUB_TAB_ID) ||
    resourceId.startsWith('ms-mismatch:')
  );
}

/**
 * Builds a mock server mismatch detail tab resource id.
 */
export function mockServerMismatchTabResourceId(id: string): string {
  return `ms-mismatch:${id}`;
}

/**
 * Returns whether a tab should be stripped when restoring workspace session.
 */
export function shouldStripWorkspaceTabOnRestore(kind: WorkspaceTabKind, resourceId: string): boolean {
  if (kind === 'mock-server') {
    return !isPersistedMockServerTabId(resourceId);
  }
  if (kind === 'regression') {
    return !resourceId.startsWith('rg:');
  }
  if (kind === 'load-test') {
    return !resourceId.startsWith('lt:');
  }
  if (kind === 'capture') {
    return !resourceId.startsWith('cap:');
  }
  if (kind === 'interceptor-rule') {
    return !resourceId.startsWith('int-rule:');
  }
  if (kind === 'test-suite') {
    return !resourceId.startsWith('ts:');
  }
  return false;
}

/**
 * Builds a test-suite tab resource id.
 */
export function testSuiteTabResourceId(kind: 'folder' | 'flow', id: string): string {
  return kind === 'folder' ? `ts:fld:${id}` : `ts:flw:${id}`;
}

export function parseTestSuiteTabResourceId(
  resourceId: string,
): { readonly kind: 'folder' | 'flow'; readonly id: string } | null {
  if (resourceId.startsWith('ts:fld:')) {
    return { kind: 'folder', id: resourceId.slice('ts:fld:'.length) };
  }
  if (resourceId.startsWith('ts:flw:')) {
    return { kind: 'flow', id: resourceId.slice('ts:flw:'.length) };
  }
  return null;
}

export function loadTestTabResourceId(id: string): string {
  return `lt:${id}`;
}

export function regressionTabResourceId(id: string): string {
  return `rg:${id}`;
}

export function mockServerTabResourceId(id: string): string {
  return `ms:${id}`;
}

export function captureTabResourceId(id: string): string {
  return `cap:${id}`;
}

export function interceptorRuleTabResourceId(id: string): string {
  return `int-rule:${id}`;
}
