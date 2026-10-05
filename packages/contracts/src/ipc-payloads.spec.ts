import { describe, expect, it } from 'vitest';

import { collabBranchSchema, isValidGitBranchName } from './collab';
import {
  importFileNameSchema,
  ipcIdSchema,
  ipcOptionalIdSchema,
  workspaceImportApplyRequestSchema,
  workspaceNameSchema,
  workspaceOrderSchema,
} from './ipc-payloads';

describe('isValidGitBranchName', () => {
  it.each(['main', 'feature/login', 'release-1.2', 'team/qa/nightly'])('accepts %s', (name) => {
    // Act
    const isValid = isValidGitBranchName(name);

    // Assert
    expect(isValid).toBe(true);
  });

  it.each([
    '',
    '@',
    '-rf',
    '/main',
    'main/',
    'main.',
    'main.lock',
    'a..b',
    'a//b',
    'a@{1}',
    'has space',
    'a~1',
    'a^b',
    'a:b',
    'a?b',
    'a*b',
    'a[b',
    'a\\b',
    '.hidden',
    'team/.hidden',
    'team/x.lock/y',
  ])('rejects %j', (name) => {
    // Act
    const isValid = isValidGitBranchName(name);

    // Assert
    expect(isValid).toBe(false);
  });

  it('trims and validates through the branch schema', () => {
    // Act
    const trimmed = collabBranchSchema.safeParse({ branch: '  main  ' });
    const invalid = collabBranchSchema.safeParse({ branch: '--upload-pack=evil' });

    // Assert
    expect(trimmed.success && trimmed.data.branch).toBe('main');
    expect(invalid.success).toBe(false);
  });
});

describe('ipc payload schemas', () => {
  it('requires a non-empty id', () => {
    // Act
    const blank = ipcIdSchema.safeParse('   ');
    const wrongType = ipcIdSchema.safeParse(42);

    // Assert
    expect(blank.success).toBe(false);
    expect(wrongType.success).toBe(false);
  });

  it('maps absent or blank optional ids to undefined', () => {
    // Act
    const values = [null, undefined, '', '  ', 'repo-1'].map((value) => ipcOptionalIdSchema.parse(value));

    // Assert
    expect(values).toEqual([undefined, undefined, undefined, undefined, 'repo-1']);
  });

  it('falls back for malformed workspace and file names', () => {
    // Act
    const name = workspaceNameSchema.parse({ evil: true });
    const fileName = importFileNameSchema.parse(null);

    // Assert
    expect(name).toBe('');
    expect(fileName).toBe('import.bin');
  });

  it('rejects a reorder list with non-string ids', () => {
    // Act
    const result = workspaceOrderSchema.safeParse(['a', 7]);

    // Assert
    expect(result.success).toBe(false);
  });

  it('rejects an import apply request without a path', () => {
    // Act
    const result = workspaceImportApplyRequestSchema.safeParse({ mode: 'merge', selection: {} });

    // Assert
    expect(result.success).toBe(false);
  });
});
