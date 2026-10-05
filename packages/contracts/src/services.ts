import { z } from 'zod';

export const serviceIdSchema = z.enum([
  'regression',
  'flows',
  'emulator',
  'load',
  'mocks',
  'listeners',
  'intercept',
]);

export type ServiceId = z.infer<typeof serviceIdSchema>;

export const SERVICE_IDS = serviceIdSchema.options;

export const serviceGroupIdSchema = z.enum(['scenarios', 'traffic']);

export type ServiceGroupId = z.infer<typeof serviceGroupIdSchema>;

export const SERVICE_GROUP_IDS = serviceGroupIdSchema.options;

/** Sidebar heading for a service catalog group. */
export interface ServiceGroup {
  readonly id: ServiceGroupId;
  readonly label: string;
}

export const SERVICE_GROUPS: readonly ServiceGroup[] = [
  { id: 'scenarios', label: 'Scenarios' },
  { id: 'traffic', label: 'Traffic' },
];

/** One mocked service shown in the Services sidebar. */
export interface ServiceItem {
  readonly id: ServiceId;
  readonly group: ServiceGroupId;
  readonly label: string;
  readonly description: string;
  readonly preview: string;
}

export const DEFAULT_SERVICES: readonly ServiceItem[] = [
  {
    id: 'regression',
    group: 'scenarios',
    label: 'Regression',
    description: 'Run flow packs as a suite against an environment',
    preview:
      'Pick flows and scenarios into a pack, choose an environment, and run the suite. Track pass rate, duration, and promote a golden run for comparison — all on this machine.',
  },
  {
    id: 'flows',
    group: 'scenarios',
    label: 'Flows',
    description: 'Nested step tree for scenarios and branches',
    preview:
      'Build a nested tree of HTTP, database, wait, and assert steps. Branches and loops drive multi-step scenarios without leaving the workbench.',
  },
  {
    id: 'emulator',
    group: 'scenarios',
    label: 'Emulator',
    description: 'Device profiles for the sidecar Android emulator',
    preview:
      'Choose a device profile and start or stop the emulator window. Install APKs from the Emulator tab (Play Store often blocks carrier apps). The phone stays a sidecar window.',
  },
  {
    id: 'load',
    group: 'scenarios',
    label: 'Load',
    description: 'Concurrent virtual users against a request',
    preview:
      'Ramp virtual users against a request or flow, then inspect latency percentiles, error rate, and throughput. Runs stay on this machine.',
  },
  {
    id: 'mocks',
    group: 'traffic',
    label: 'Mock',
    description: 'Local HTTP mock server with matched responses',
    preview:
      'Define endpoints that match method and path, return canned bodies, and start a loopback mock server. Use {{placeholders}} from Environments in paths and bodies.',
  },
  {
    id: 'listeners',
    group: 'traffic',
    label: 'Listener',
    description: 'Capture browser or emulator HTTP traffic',
    preview:
      'Watch live exchanges from an E2E window or Android emulator MITM, filter like DevTools Network, and inspect headers and bodies.',
  },
  {
    id: 'intercept',
    group: 'traffic',
    label: 'Interceptor',
    description: 'Match and rewrite emulator HTTP via MITM',
    preview:
      'Arm passthrough, mock, or block rules on the device proxy. Edit headers and bodies with {{placeholders}} from Environments.',
  },
];

const SERVICES_BY_ID = new Map(DEFAULT_SERVICES.map((item) => [item.id, item]));

export function isServiceId(value: string): value is ServiceId {
  return SERVICES_BY_ID.has(value as ServiceId);
}

export function serviceById(id: string): ServiceItem | null {
  return SERVICES_BY_ID.get(id as ServiceId) ?? null;
}

/**
 * Returns catalog items grouped in sidebar order.
 * Empty groups are omitted so the hub only shows headings that have services.
 */
export function serviceGroups(): readonly { readonly group: ServiceGroup; readonly items: readonly ServiceItem[] }[] {
  return SERVICE_GROUPS.map((group) => ({
    group,
    items: DEFAULT_SERVICES.filter((item) => item.group === group.id),
  })).filter((section) => section.items.length > 0);
}

export const SERVICE_ARTIFACT_TAB_KIND = {
  flows: 'flow',
  load: 'load',
  regression: 'regression',
  mocks: 'mock-endpoint',
  listeners: 'listener-session',
  intercept: 'intercept-rule',
} as const;

export type ServiceArtifactTabKind = (typeof SERVICE_ARTIFACT_TAB_KIND)[keyof typeof SERVICE_ARTIFACT_TAB_KIND];

export function serviceIdFromTabKind(kind: string): ServiceId | null {
  switch (kind) {
    case 'flow':
    case 'flow-template':
      return 'flows';
    case 'load':
      return 'load';
    case 'regression':
      return 'regression';
    case 'emulator':
      return 'emulator';
    case 'mock-endpoint':
      return 'mocks';
    case 'listener-session':
      return 'listeners';
    case 'intercept-rule':
      return 'intercept';
    default:
      return null;
  }
}

export function defaultServiceSection(kind: string): string {
  if (kind === 'flow')
    return 'design';
  if (kind === 'mock-endpoint')
    return 'matchers';
  if (kind === 'listener-session')
    return 'capture';
  if (kind === 'intercept-rule')
    return 'match';
  return 'overview';
}
