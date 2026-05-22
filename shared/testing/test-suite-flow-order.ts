import type { TestSuiteFlow, TestSuiteFlowNode, TestSuiteFlowStep } from './test-suites.schema';
import { isFlowFolderNode, isFlowStepNode } from './test-suites.schema';
import type { E2eStepConfig, HttpInterceptorStepConfig, HttpListenerStepConfig, RequestStepConfig, TestSuiteStepStatus } from './test-suite-steps.schema';
import { resolveGlobalE2eScreenshotDirectory } from './e2e-screenshot-output';

/**
 * Flatten flow nodes in execution order (DFS: node then folder children).
 */
export function flattenFlowNodesInRunOrder(nodes: readonly TestSuiteFlowNode[]): TestSuiteFlowNode[] {
  const flat: TestSuiteFlowNode[] = [];
  for (const node of nodes) {
    flat.push(node);
    if (isFlowFolderNode(node)) {
      flat.push(...flattenFlowNodesInRunOrder(node.children));
    }
  }
  return flat;
}

/** IPC payload when a flow run advances step status. */
export interface FlowRunProgressEvent {
  readonly flowId: string;
  readonly stepStatuses: Readonly<Record<string, TestSuiteStepStatus>>;
}

/** Initial live statuses when a flow run starts (first step running, rest waiting). */
export function buildInitialFlowRunStatuses(
  stepIds: readonly string[],
): Record<string, TestSuiteStepStatus> {
  const statuses: Record<string, TestSuiteStepStatus> = {};
  stepIds.forEach((id, index) => {
    statuses[id] = index === 0 ? 'running' : 'waiting';
  });
  return statuses;
}

/** Marks steps after `fromIndex` as skipped when a run stops early. */
export function markRemainingFlowStepsSkipped(
  stepStatuses: Record<string, TestSuiteStepStatus>,
  steps: readonly { readonly id: string }[],
  fromIndex: number,
): void {
  for (let i = fromIndex + 1; i < steps.length; i++) {
    const id = steps[i]?.id;
    if (id && stepStatuses[id] === 'waiting') {
      stepStatuses[id] = 'skipped';
    }
  }
}

/** Returns enabled steps only, in run order. */
export function flattenEnabledFlowSteps(nodes: readonly TestSuiteFlowNode[]): TestSuiteFlowStep[] {
  return flattenFlowNodesInRunOrder(nodes).filter(
    (node): node is TestSuiteFlowStep => isFlowStepNode(node) && node.enabled,
  );
}

/** Finds a step by id within a flow graph. */
export function findFlowStepById(
  nodes: readonly TestSuiteFlowNode[],
  stepId: string,
): TestSuiteFlowStep | null {
  for (const node of flattenFlowNodesInRunOrder(nodes)) {
    if (isFlowStepNode(node) && node.id === stepId) {
      return node;
    }
  }
  return null;
}

/**
 * Hoists all steps to the flow root in DFS order and drops folder nodes.
 * Used by the flow tab UI (flat step list only).
 */
export function normalizeFlowStepNodes(nodes: readonly TestSuiteFlowNode[]): TestSuiteFlowStep[] {
  const steps: TestSuiteFlowStep[] = [];

  const walk = (items: readonly TestSuiteFlowNode[]): void => {
    for (const node of items) {
      if (isFlowStepNode(node)) {
        steps.push({ ...node, parentId: null });
      } else if (isFlowFolderNode(node)) {
        walk(node.children);
      }
    }
  };

  walk(nodes);
  return steps;
}

const E2E_ACTIONS_REQUIRING_PRIOR_NAV = new Set([
  'CLICK',
  'TYPE_TEXT',
  'HOVER',
  'ASSERT_ELEMENT',
  'SCROLL_TO',
  'SCREENSHOT',
  'ASSERT_URL',
  'WAIT_FOR_URL',
]);

function normalizeE2eAction(action: string): string {
  if (action === 'OPEN_PAGE') {
    return 'NAVIGATE_TO';
  }
  if (action === 'MOVE_TO') {
    return 'HOVER';
  }
  return action;
}

function flowStepDisplayLabel(step: TestSuiteFlowStep): string {
  const name = String(step.name ?? '').trim();
  return name.length > 0 ? name : 'Step';
}

/** Resolved E2E step payload for pick replay on the runner window. */
export interface ResolvedE2ePickStep {
  readonly action: string;
  readonly selector: string;
  readonly value: string;
  readonly timeout: number;
  readonly screenshotPath?: string;
  readonly screenshotFileName?: string;
}

/**
 * Enabled E2E steps strictly before `currentStepId` in flattened order, with placeholders resolved.
 */
export function getPrecedingEnabledE2eStepsForPick(
  nodes: readonly TestSuiteFlowNode[],
  currentStepId: string,
  resolver: (raw: string) => string,
  e2eScreenshotFolder: string | undefined,
  flow: { readonly id: string; readonly name: string },
): ResolvedE2ePickStep[] {
  const flat = flattenFlowNodesInRunOrder(nodes);
  const out: ResolvedE2ePickStep[] = [];

  for (const node of flat) {
    if (isFlowFolderNode(node)) {
      continue;
    }
    if (node.id === currentStepId) {
      break;
    }
    if (!node.enabled || node.stepType !== 'E2E') {
      continue;
    }

    const config = node.config as E2eStepConfig;
    let action = normalizeE2eAction(String(config.action ?? 'NAVIGATE_TO'));
    let timeoutMs = 5000;
    if (typeof config.timeout === 'number' && Number.isFinite(config.timeout)) {
      timeoutMs = config.timeout;
    } else if (typeof config.timeout === 'string' && config.timeout.trim()) {
      const parsed = Number.parseFloat(config.timeout.trim());
      timeoutMs = Number.isFinite(parsed) ? parsed : 5000;
    }

    const row: ResolvedE2ePickStep =
      action === 'SCREENSHOT'
        ? {
            action,
            selector: resolver(config.selector ?? ''),
            value: resolver(config.value ?? ''),
            timeout: timeoutMs >= 0 ? timeoutMs : 5000,
            screenshotPath:
              resolveGlobalE2eScreenshotDirectory(e2eScreenshotFolder, flow) ??
              resolver(String(config.screenshotPath ?? '')),
            screenshotFileName: resolver(String(config.screenshotFileName ?? '')),
          }
        : {
            action,
            selector: resolver(config.selector ?? ''),
            value: resolver(config.value ?? ''),
            timeout: timeoutMs >= 0 ? timeoutMs : 5000,
          };

    out.push(row);
  }

  return out;
}

/** When non-null, Run Flow should stay disabled and the string is suitable for a tooltip. */
export function getFlowRunBlockingReason(flow: TestSuiteFlow | null | undefined): string | null {
  if (!flow?.nodes?.length) {
    return 'Add at least one step to run this flow.';
  }

  const flat = flattenFlowNodesInRunOrder(flow.nodes);
  let enabledStepCount = 0;
  let hasLoadedE2eUrl = false;

  for (const node of flat) {
    if (isFlowFolderNode(node)) {
      continue;
    }
    if (!node.enabled) {
      continue;
    }
    enabledStepCount++;

    if (node.stepType === 'REQUEST') {
      const cfg = node.config as RequestStepConfig;
      const source =
        cfg.requestSource === 'collection' || cfg.requestSource === 'manual'
          ? cfg.requestSource
          : cfg.collectionRequestId
            ? 'collection'
            : 'manual';
      if (source === 'collection') {
        if (!cfg.collectionRequestId) {
          return `HTTP Request "${node.name}": select a request from collections.`;
        }
        continue;
      }
      const url = String(cfg.url ?? '').trim();
      if (!url) {
        return `HTTP Request "${node.name}": specify a URL for the manual request.`;
      }
      continue;
    }

    if (node.stepType === 'HTTP_LISTENER' || node.stepType === 'HTTP_INTERCEPTOR') {
      const cfg = node.config as HttpListenerStepConfig | HttpInterceptorStepConfig;
      const urlPattern = String(cfg.urlPattern ?? '').trim();
      if (!urlPattern) {
        const label = node.stepType === 'HTTP_INTERCEPTOR' ? 'HTTP Interceptor' : 'HTTP Listener';
        return `${flowStepDisplayLabel(node)}: ${label} needs a URL pattern.`;
      }
      continue;
    }

    if (node.stepType !== 'E2E') {
      continue;
    }

    const cfg = node.config as E2eStepConfig;
    const action = normalizeE2eAction(String(cfg.action ?? ''));

    if (action === 'NAVIGATE_TO') {
      const url = String(cfg.value ?? '').trim() || String(cfg.selector ?? '').trim();
      if (!url) {
        return `${flowStepDisplayLabel(node)}: Navigate to URL needs a page URL.`;
      }
      hasLoadedE2eUrl = true;
      continue;
    }

    if (E2E_ACTIONS_REQUIRING_PRIOR_NAV.has(action) && !hasLoadedE2eUrl) {
      return `${flowStepDisplayLabel(node)}: add an enabled Navigate to URL step above this browser step.`;
    }
  }

  if (enabledStepCount === 0) {
    return 'Enable at least one step to run this flow.';
  }
  return null;
}
