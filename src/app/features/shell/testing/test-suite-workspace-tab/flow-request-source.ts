import {
  resolveFlowRequestStepSource,
  type FlowRequestStepSource,
} from '@shared/testing';

export { resolveFlowRequestStepSource, type FlowRequestStepSource };

export const FLOW_REQUEST_SOURCE_OPTIONS: readonly {
  readonly value: FlowRequestStepSource;
  readonly label: string;
}[] = [
  { value: 'manual', label: 'Manual request' },
  { value: 'collection', label: 'Select request' },
];
