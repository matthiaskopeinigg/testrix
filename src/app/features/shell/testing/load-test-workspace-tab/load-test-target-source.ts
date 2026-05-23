import type { LoadTestTargetSource } from '@shared/testing';

export const LOAD_TEST_TARGET_SOURCE_OPTIONS: readonly {
  readonly value: LoadTestTargetSource;
  readonly label: string;
}[] = [
  { value: 'collection', label: 'Collection request' },
  { value: 'manual', label: 'Manual request' },
];
