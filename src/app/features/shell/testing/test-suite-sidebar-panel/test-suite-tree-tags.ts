import type { TestSuiteFlow, TestSuiteFolder } from '@shared/testing';

/** Builds sidebar tree tag chips from persisted folder/flow metadata (user tags only). */
export function testSuiteTreeTags(
  item: Pick<TestSuiteFolder, 'tags'> | Pick<TestSuiteFlow, 'tags'>,
): readonly string[] | undefined {
  const tags = item.tags ?? [];
  return tags.length > 0 ? [...tags] : undefined;
}
