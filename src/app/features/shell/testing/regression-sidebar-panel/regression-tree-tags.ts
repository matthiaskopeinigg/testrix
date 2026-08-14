import type { RegressionArtifact, RegressionFolder } from '@shared/testing';

/** Builds sidebar tree tag chips from persisted folder/artifact metadata. */
export function regressionTreeTags(
  item: Pick<RegressionFolder, 'tags'> | Pick<RegressionArtifact, 'tags'>,
): readonly string[] | undefined {
  const tags = item.tags ?? [];
  return tags.length > 0 ? [...tags] : undefined;
}
