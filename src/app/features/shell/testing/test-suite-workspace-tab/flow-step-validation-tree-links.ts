import type { TestSuiteFlowNode } from '@shared/testing';
import { normalizeFlowStepNodes } from '@shared/testing';
import type { ValidationStepConfig, CacheStepConfig } from '@shared/testing';

/** Directed link from a validation step to its reference step in the flat tree. */
export interface FlowValidationTreeLink {
  readonly validationId: string;
  readonly refId: string;
}

/** Collects validation → reference links for steps present in the flow tree. */
export function collectFlowValidationReferenceLinks(
  nodes: readonly TestSuiteFlowNode[],
): readonly FlowValidationTreeLink[] {
  const steps = normalizeFlowStepNodes(nodes);
  const stepIds = new Set(steps.map((step) => step.id));
  const links: FlowValidationTreeLink[] = [];

  for (const step of steps) {
    if (step.stepType !== 'VALIDATION' && step.stepType !== 'CACHE') {
      continue;
    }
    const refId = String(
      (step.config as ValidationStepConfig | CacheStepConfig).refStepId ?? '',
    ).trim();
    if (!refId || !stepIds.has(refId)) {
      continue;
    }
    links.push({ validationId: step.id, refId });
  }

  return links;
}

export interface FlowValidationAnchor {
  readonly x: number;
  readonly y: number;
}

export interface FlowValidationLinkPath {
  readonly id: string;
  readonly d: string;
  readonly refDot: FlowValidationAnchor;
  readonly validationDot: FlowValidationAnchor;
  readonly highlighted: boolean;
}

/** Assigns staggered rail lanes so parallel validation links do not overlap. */
export function assignValidationLinkLanes(
  links: readonly FlowValidationTreeLink[],
  stepOrder: ReadonlyMap<string, number>,
): ReadonlyMap<string, number> {
  const sorted = [...links].sort(
    (a, b) =>
      (stepOrder.get(a.validationId) ?? 0) - (stepOrder.get(b.validationId) ?? 0),
  );
  const lanes = new Map<string, number>();
  sorted.forEach((link, index) => {
    lanes.set(link.validationId, index);
  });
  return lanes;
}

/** Computes the shared rail X for a link lane (0 = leftmost gutter). */
export function validationLinkRailX(lane: number, laneSpacing = 6, baseX = 4): number {
  return baseX + lane * laneSpacing;
}

/**
 * Builds a rounded elbow from the validation row back to the referenced row.
 * Path: validation icon → rail → reference icon.
 */
export function buildFlowValidationLinkPath(
  ref: FlowValidationAnchor,
  validation: FlowValidationAnchor,
  railX: number,
  cornerRadius = 5,
): string {
  const sx = validation.x;
  const sy = validation.y;
  const ex = ref.x;
  const ey = ref.y;

  if (Math.abs(sy - ey) < 1) {
    return `M ${sx} ${sy} H ${ex}`;
  }

  const r = Math.min(cornerRadius, Math.abs(ey - sy) / 2, 8);
  const dir = ey > sy ? 1 : -1;

  return [
    `M ${sx} ${sy}`,
    `H ${railX + r}`,
    `Q ${railX} ${sy}, ${railX} ${sy + dir * r}`,
    `V ${ey - dir * r}`,
    `Q ${railX} ${ey}, ${railX + r} ${ey}`,
    `H ${ex}`,
  ].join(' ');
}

export function buildFlowValidationLinkGraphic(
  id: string,
  ref: FlowValidationAnchor,
  validation: FlowValidationAnchor,
  options: {
    readonly lane: number;
    readonly highlighted?: boolean;
  },
): FlowValidationLinkPath {
  const railX = validationLinkRailX(options.lane);
  return {
    id,
    d: buildFlowValidationLinkPath(ref, validation, railX),
    refDot: ref,
    validationDot: validation,
    highlighted: options.highlighted ?? false,
  };
}
