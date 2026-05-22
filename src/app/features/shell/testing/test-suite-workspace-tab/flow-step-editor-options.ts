import { HTTP_METHOD_IDS } from '@shared/config';
import { TEST_SUITE_STEP_TYPES, type TestSuiteStepType } from '@shared/testing';

import type { TxDropdownOption } from '@app/shared/components/tx-dropdown/tx-dropdown.types';

import { FLOW_STEP_ADD_HINTS, FLOW_STEP_ADD_ICONS, FLOW_STEP_GUIDED_TITLES } from './flow-step-labels';

const STEP_LABELS: Record<TestSuiteStepType, string> = {
  REQUEST: 'HTTP Request',
  VALIDATION: 'Validation',
  DATABASE: 'Database',
  E2E: 'Browser (E2E)',
  HTTP_LISTENER: 'HTTP Listener',
  HTTP_INTERCEPTOR: 'HTTP Interceptor',
  WAIT: 'Wait',
  MANUAL: 'Manual input',
  TRIGGER: 'Trigger flow',
};

const E2E_ACTION_LABELS: Record<string, string> = {
  NAVIGATE_TO: 'Navigate to URL',
  CLICK: 'Click element',
  TYPE_TEXT: 'Type text',
  HOVER: 'Hover',
  WAIT: 'Wait',
  SCROLL_TO: 'Scroll to',
  SCREENSHOT: 'Screenshot',
  ASSERT_ELEMENT: 'Assert element',
  ASSERT_URL: 'Assert URL',
  WAIT_FOR_URL: 'Wait for URL',
};

/** HTTP methods for REQUEST step editor. */
export const FLOW_STEP_HTTP_METHOD_OPTIONS: readonly TxDropdownOption[] = HTTP_METHOD_IDS.map(
  (method) => ({ value: method, label: method }),
);

/** E2E actions for browser step editor. */
export const FLOW_STEP_E2E_ACTION_OPTIONS: readonly TxDropdownOption[] = [
  'NAVIGATE_TO',
  'CLICK',
  'TYPE_TEXT',
  'HOVER',
  'WAIT',
  'SCROLL_TO',
  'SCREENSHOT',
  'ASSERT_ELEMENT',
  'ASSERT_URL',
  'WAIT_FOR_URL',
].map((value) => ({ value, label: E2E_ACTION_LABELS[value] ?? value }));

/** TRIGGER step target type. */
export const FLOW_STEP_TRIGGER_TARGET_OPTIONS: readonly TxDropdownOption[] = [
  { value: 'flow', label: 'Flow' },
  { value: 'folder', label: 'Folder' },
];

/** Request body types for REQUEST steps. */
export const FLOW_STEP_BODY_TYPE_OPTIONS: readonly TxDropdownOption[] = [
  { value: 'none', label: 'None' },
  { value: 'json', label: 'JSON' },
  { value: 'xml', label: 'XML' },
  { value: 'text', label: 'Text' },
  { value: 'graphql', label: 'GraphQL' },
  { value: 'form-data', label: 'Form data' },
  { value: 'urlencoded', label: 'URL encoded' },
  { value: 'binary', label: 'Binary' },
];

/** Validation rule source options. */
export const FLOW_STEP_VALIDATION_SOURCE_OPTIONS: readonly TxDropdownOption[] = [
  { value: 'response_status', label: 'Response status' },
  { value: 'response_body', label: 'Response body' },
  { value: 'response_header', label: 'Response header' },
  { value: 'request_body', label: 'Request body' },
  { value: 'request_header', label: 'Request header' },
  { value: 'cached_value', label: 'Cached value' },
];

/** Validation rule operator options. */
export const FLOW_STEP_VALIDATION_OPERATOR_OPTIONS: readonly TxDropdownOption[] = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'matches_regex', label: 'Matches regex' },
  { value: 'greater_than', label: 'Greater than' },
  { value: 'less_than', label: 'Less than' },
  { value: 'exists', label: 'Exists' },
  { value: 'not_exists', label: 'Does not exist' },
  { value: 'is_empty', label: 'Is empty' },
  { value: 'is_not_empty', label: 'Is not empty' },
];

/** HTTP listener match phase. */
export const FLOW_STEP_LISTENER_PHASE_OPTIONS: readonly TxDropdownOption[] = [
  { value: 'request', label: 'Request' },
  { value: 'response', label: 'Response' },
];

/** HTTP interceptor action. */
export const FLOW_STEP_INTERCEPTOR_ACTION_OPTIONS: readonly TxDropdownOption[] = [
  { value: 'modify', label: 'Modify' },
  { value: 'block', label: 'Block' },
];

/** Add-step modal tile metadata. */
export interface FlowStepAddTile {
  readonly type: TestSuiteStepType;
  readonly label: string;
  readonly hint: string;
  readonly icon: (typeof FLOW_STEP_ADD_ICONS)[TestSuiteStepType];
}

/** Tiles for the add-step modal grid. */
export const FLOW_STEP_ADD_TILES: readonly FlowStepAddTile[] = TEST_SUITE_STEP_TYPES.map((type) => ({
  type,
  label: STEP_LABELS[type],
  hint: FLOW_STEP_ADD_HINTS[type],
  icon: FLOW_STEP_ADD_ICONS[type],
}));
