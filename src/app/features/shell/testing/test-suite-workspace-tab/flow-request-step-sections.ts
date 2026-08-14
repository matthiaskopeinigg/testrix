import type { TxIconName } from '@app/shared/icons';

export type FlowRequestStepSection = 'params' | 'headers' | 'body';

export interface FlowRequestStepNavItem {
  readonly id: FlowRequestStepSection;
  readonly label: string;
  readonly icon: TxIconName;
}

/** Section tabs for the flow REQUEST step manual editor. */
export const FLOW_REQUEST_STEP_NAV_ITEMS: readonly FlowRequestStepNavItem[] = [
  { id: 'params', label: 'Params', icon: 'hash' },
  { id: 'headers', label: 'Headers', icon: 'layers' },
  { id: 'body', label: 'Body', icon: 'fileText' },
];
