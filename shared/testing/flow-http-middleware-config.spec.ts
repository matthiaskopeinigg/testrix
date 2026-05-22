import { describe, expect, it } from 'vitest';

import type { EnvironmentsFile } from '../config/environments.schema';

import {
  buildFlowEnvironmentVariableContext,
  buildHttpCaptureRegisterSpec,
  flowNeedsBrowserRunner,
  resolveHttpInterceptorStepConfig,
} from './flow-http-middleware-config';
import type { TestSuiteFlow } from './test-suites.schema';

const environments: EnvironmentsFile = {
  schemaVersion: 1,
  meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  environments: [
    {
      id: 'env-local',
      name: 'Local',
      nodes: [
        {
          id: 'v1',
          kind: 'variable',
          key: 'apiHost',
          value: 'api.example.com',
        },
      ],
    },
  ],
};

const flow = {
  id: 'flow-1',
  name: 'Flow',
  description: '',
  tags: [],
  environmentId: 'env-local',
  lastRunStatus: 'never' as const,
  lastRunAt: null,
  nodes: [],
  updatedAt: '2026-01-01T00:00:00.000Z',
} satisfies TestSuiteFlow;

describe('flow-http-middleware-config', () => {
  it('detects browser runner requirement for interceptor steps', () => {
    expect(flowNeedsBrowserRunner([{ stepType: 'HTTP_INTERCEPTOR' }])).toBe(true);
    expect(flowNeedsBrowserRunner([{ stepType: 'REQUEST' }])).toBe(false);
  });

  it('resolves environment placeholders in interceptor config', () => {
    const resolved = resolveHttpInterceptorStepConfig(
      {
        urlPattern: 'https://{{apiHost}}/login',
        method: 'POST',
        matchPhase: 'request',
        interceptAction: 'modify',
        amendHeaders: [{ key: 'Authorization', value: 'Bearer {{apiHost}}', enabled: true }],
        amendQueryParams: [],
        replaceBodyType: 'json',
        replacePostBody: '{"host":"{{apiHost}}"}',
      },
      buildFlowEnvironmentVariableContext(flow, environments),
    );

    expect(resolved.urlPattern).toBe('https://api.example.com/login');
    expect(resolved.amendHeaders[0]?.value).toBe('Bearer api.example.com');
    expect(resolved.replacePostBody).toBe('{"host":"api.example.com"}');
  });

  it('builds listener register spec without mutation', () => {
    const spec = buildHttpCaptureRegisterSpec(
      'step-listener',
      {
        urlPattern: '**/api/**',
        method: 'GET',
        matchPhase: 'request',
      },
      false,
    );

    expect(spec['listenerId']).toBe('step-listener');
    expect(spec['mutate']).toBe(false);
    expect(spec['matchPhase']).toBe('request');
  });

  it('builds mutate register spec for interceptors', () => {
    const spec = buildHttpCaptureRegisterSpec(
      'step-1',
      {
        urlPattern: '/api/**',
        method: 'POST',
        matchPhase: 'request',
        interceptAction: 'block',
        amendHeaders: [],
        amendQueryParams: [],
      },
      true,
    );

    expect(spec['listenerId']).toBe('step-1');
    expect(spec['mutate']).toBe(true);
    expect(spec['interceptAction']).toBe('block');
  });
});
