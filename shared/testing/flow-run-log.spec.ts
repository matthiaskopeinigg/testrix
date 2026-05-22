import { describe, expect, it } from 'vitest';

import { createFlowStep } from '@shared/testing';
import type { FlowStepHttpResponseCapture } from '@shared/testing';
import {
  buildFlowStepRunLogDetails,
  buildFlowValidationCheckResults,
  formatFlowRunDuration,
  formatFlowRunTimestamp,
  parseFlowRunStepError,
  resolveFlowStepRunError,
} from '@shared/testing';

describe('formatFlowRunDuration', () => {
  it('formats sub-second durations in milliseconds', () => {
    expect(formatFlowRunDuration(450)).toBe('450 ms');
  });

  it('formats longer durations in seconds', () => {
    expect(formatFlowRunDuration(1200)).toBe('1.2 s');
  });
});

describe('buildFlowValidationCheckResults', () => {
  it('marks failed checks when actual does not match expected', () => {
    const capture: FlowStepHttpResponseCapture = {
      kind: 'http_response',
      capturedAt: '2026-01-01T00:00:00.000Z',
      statusCode: 404,
      statusText: 'Not Found',
      bodyText: '',
      headers: {},
    };

    const results = buildFlowValidationCheckResults(
      [{ source: 'response_status', expression: '', operator: 'equals', expected: '200' }],
      capture,
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.passed).toBe(false);
    expect(results[0]?.actual).toBe('404');
    expect(results[0]?.expected).toBe('200');
  });
});

describe('resolveFlowStepRunError', () => {
  it('prefers live and persisted errors over the run message', () => {
    const step = createFlowStep('REQUEST', 'Get users');
    step.error = 'HTTP 404 Not Found';

    expect(
      resolveFlowStepRunError(step, 'failed', {
        liveError: 'Live failure',
        runMessage: 'Get users: HTTP 404 Not Found',
      }),
    ).toBe('Live failure');

    expect(
      resolveFlowStepRunError(step, 'failed', {
        runMessage: 'Get users: HTTP 404 Not Found',
      }),
    ).toBe('HTTP 404 Not Found');
  });

  it('strips the step name prefix from the run message fallback', () => {
    const step = createFlowStep('REQUEST', 'Get users');
    expect(parseFlowRunStepError('Get users: HTTP 500 Internal Server Error', step)).toBe(
      'HTTP 500 Internal Server Error',
    );
  });
});

describe('buildFlowStepRunLogDetails', () => {
  it('includes HTTP capture summary for request steps', () => {
    const step = {
      ...createFlowStep('REQUEST', 'Get users'),
      lastRunStatus: 'passed' as const,
      lastRunDurationMs: 320,
      lastRunCapture: {
        kind: 'http_response' as const,
        capturedAt: '2026-01-01T00:00:00.000Z',
        statusCode: 200,
        statusText: 'OK',
        bodyText: '{"ok":true}',
        headers: { 'content-type': 'application/json' },
        requestMethod: 'GET',
        requestUrl: 'https://example.com/users',
      },
    };

    const details = buildFlowStepRunLogDetails(
      step,
      {
        id: 'flow-1',
        name: 'Flow',
        description: '',
        tags: [],
        lastRunStatus: 'passed',
        lastRunAt: '2026-01-01T00:00:00.000Z',
        nodes: [step],
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      'passed',
      320,
    );

    expect(details.durationLabel).toBe('320 ms');
    expect(details.captureLines.some((line) => line.label === 'Status')).toBe(true);
    expect(details.capturePreview?.content).toContain('{"ok":true}');
    expect(formatFlowRunTimestamp('2026-01-01T12:30:00.000Z')).toMatch(/\d/);
  });
});
