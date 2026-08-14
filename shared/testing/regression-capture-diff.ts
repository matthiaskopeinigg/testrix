import { diffLines, type Change } from 'diff';

import { formatPrettyBody } from '../http/response-body-display';
import { prepareBodyForDiff, type LineDiffHunk, type ResponseDiffResult } from '../http/response-diff';

import type { FlowStepRunCapture } from './flow-step-capture';

export interface RegressionCaptureDiffOptions {
  readonly normalizeJson?: boolean;
}

export interface RegressionCaptureDiffSummary {
  readonly changed: boolean;
  readonly summaryLines: readonly string[];
}

function captureBodyText(capture: FlowStepRunCapture): string {
  if (capture.kind === 'http_response') {
    return capture.bodyText;
  }
  if (capture.kind === 'database_result') {
    return capture.dbText;
  }
  return capture.elementText || capture.elementHtml;
}

function captureBodyTextForDiff(
  capture: FlowStepRunCapture,
  normalizeJson: boolean,
): string {
  const raw = captureBodyText(capture);
  if (!normalizeJson || capture.kind !== 'http_response') {
    return raw;
  }
  const pretty = formatPrettyBody(raw);
  return prepareBodyForDiff(pretty !== raw ? pretty : raw);
}

/** Builds a high-level summary of capture differences. */
export function summarizeCaptureDiff(
  captureA: FlowStepRunCapture | undefined,
  captureB: FlowStepRunCapture | undefined,
): RegressionCaptureDiffSummary {
  if (!captureA && !captureB) {
    return { changed: false, summaryLines: ['No captures to compare'] };
  }
  if (!captureA || !captureB) {
    return { changed: true, summaryLines: ['Capture missing in one run'] };
  }
  if (captureA.kind !== captureB.kind) {
    return { changed: true, summaryLines: [`Kind changed: ${captureA.kind} → ${captureB.kind}`] };
  }

  const lines: string[] = [];
  if (captureA.kind === 'http_response' && captureB.kind === 'http_response') {
    if (captureA.statusCode !== captureB.statusCode) {
      lines.push(`Status: ${captureA.statusCode} → ${captureB.statusCode}`);
    }
    const bodyA = captureA.bodyText;
    const bodyB = captureB.bodyText;
    if (bodyA !== bodyB) {
      lines.push('Response body changed');
    }
  }

  if (captureA.kind === 'e2e_element' && captureB.kind === 'e2e_element') {
    if (captureA.elementExists !== captureB.elementExists) {
      lines.push(`Exists: ${captureA.elementExists} → ${captureB.elementExists}`);
    }
    if (captureA.elementText !== captureB.elementText) {
      lines.push('Element text changed');
    }
  }

  return {
    changed: lines.length > 0,
    summaryLines: lines.length > 0 ? lines : ['No differences'],
  };
}

/** Returns side-by-side diff bodies for tx-diff-view. */
export function regressionCaptureDiffBodies(
  captureA: FlowStepRunCapture | undefined,
  captureB: FlowStepRunCapture | undefined,
): { readonly left: string; readonly right: string } {
  return {
    left: captureA ? captureBodyText(captureA) : '',
    right: captureB ? captureBodyText(captureB) : '',
  };
}

function lineHunksFromText(left: string, right: string): LineDiffHunk[] {
  const parts = diffLines(left, right);
  return parts.flatMap((part: Change) => {
    const lines = part.value.split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }
    const kind: LineDiffHunk['kind'] = part.added ? 'add' : part.removed ? 'remove' : 'unchanged';
    return lines.map((line: string) => ({ kind, line }));
  });
}

/** Builds a ResponseDiffResult for tx-diff-view from capture bodies. */
export function buildRegressionCaptureTextDiff(
  captureA: FlowStepRunCapture | undefined,
  captureB: FlowStepRunCapture | undefined,
  options: RegressionCaptureDiffOptions = {},
): ResponseDiffResult | null {
  const normalizeJson = options.normalizeJson ?? false;
  const left =
    captureA !== undefined ? captureBodyTextForDiff(captureA, normalizeJson) : '';
  const right =
    captureB !== undefined ? captureBodyTextForDiff(captureB, normalizeJson) : '';
  if (!left && !right) {
    return null;
  }
  const lineHunks = lineHunksFromText(left, right);
  const bodyChanges = lineHunks.filter((h) => h.kind !== 'unchanged').length;
  const pass = bodyChanges === 0;
  return {
    summary: {
      statusChanged: false,
      headersAdded: 0,
      headersRemoved: 0,
      headersChanged: 0,
      bodyChanges,
      summaryLabel: pass ? 'No differences' : `${bodyChanges} line change(s)`,
      pass,
    },
    status: {
      a: { code: 0, text: '', ok: true },
      b: { code: 0, text: '', ok: true },
      changed: false,
    },
    timingDeltaMs: 0,
    headers: [],
    bodyMode: 'text',
    jsonPaths: [],
    lineHunks,
  };
}
