import { isTestSuiteFlow, isTestSuiteFolder, type TestSuiteFlow, type TestSuiteTreeItem } from './test-suites.schema';

/** Ancestor suite folder from root → immediate parent. */
export interface TestSuiteAncestorFolderRef {
  readonly id: string;
  readonly name: string;
  readonly environmentId?: string | null;
}

export interface TestSuiteFlowLocation {
  readonly flow: TestSuiteFlow;
  readonly ancestorFolders: readonly TestSuiteAncestorFolderRef[];
}

/** Finds a flow and its ancestor folders (root → parent). */
export function findTestSuiteFlowInTree(
  items: readonly TestSuiteTreeItem[],
  flowId: string,
): TestSuiteFlowLocation | null {
  let result: TestSuiteFlowLocation | null = null;

  const walk = (
    list: readonly TestSuiteTreeItem[],
    chain: readonly TestSuiteAncestorFolderRef[],
  ): void => {
    for (const item of list) {
      if (isTestSuiteFlow(item) && item.id === flowId) {
        result = { flow: item, ancestorFolders: chain };
        return;
      }
      if (isTestSuiteFolder(item)) {
        const nextChain: TestSuiteAncestorFolderRef[] = [
          ...chain,
          {
            id: item.id,
            name: item.name,
            environmentId: item.environmentId ?? null,
          },
        ];
        walk(item.children, nextChain);
        if (result) {
          return;
        }
      }
    }
  };

  walk(items, []);
  return result;
}
