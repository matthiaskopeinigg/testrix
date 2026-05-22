import type { RequestStepConfig } from '@shared/testing/test-suite-steps.schema';

export type FlowRequestStepSource = 'manual' | 'collection';

export const FLOW_REQUEST_SOURCE_OPTIONS: readonly {
  readonly value: FlowRequestStepSource;
  readonly label: string;
}[] = [
  { value: 'manual', label: 'Manual request' },
  { value: 'collection', label: 'Select request' },
];

/** Resolves how a REQUEST step should be edited and validated. */
export function resolveFlowRequestStepSource(cfg: RequestStepConfig): FlowRequestStepSource {
  if (cfg.requestSource === 'manual' || cfg.requestSource === 'collection') {
    return cfg.requestSource;
  }
  return cfg.collectionRequestId ? 'collection' : 'manual';
}
