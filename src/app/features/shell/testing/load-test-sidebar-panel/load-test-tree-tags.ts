import type { LoadTestArtifact } from '@shared/testing';

/** Builds sidebar tree tag chips from persisted load test artifact metadata. */
export function loadTestTreeTags(
  item: Pick<LoadTestArtifact, 'tags'>,
): readonly string[] | undefined {
  const tags = item.tags ?? [];
  return tags.length > 0 ? [...tags] : undefined;
}
