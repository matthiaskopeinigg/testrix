import {
  collectEnvironmentVariables,
  DEFAULT_ENVIRONMENT_VARIABLE_KEY_OPTIONS,
  environmentVariablesToMap,
  getEnvironmentDefinition,
  type EnvironmentVariableKeyOptions,
} from '../config/environment-variables';
import type { EnvironmentsFile } from '../config/environments.schema';
import { resolveTemplateVariables } from '../dynamic-variables/template-variables';

import type { FlowStepHttpResponseCapture } from './flow-step-capture';
import { flowStepHttpResponseCaptureSchema } from './flow-step-capture';
import type {
  HttpInterceptorStepConfig,
  HttpListenerStepConfig,
  TestSuiteKeyValuePair,
} from './test-suite-steps.schema';
import type { TestSuiteFlow } from './test-suites.schema';

/** Step types that require the E2E browser runner (CDP network capture / intercept). */
export const FLOW_BROWSER_NETWORK_STEP_TYPES = ['E2E', 'HTTP_LISTENER', 'HTTP_INTERCEPTOR'] as const;

export type FlowBrowserNetworkStepType = (typeof FLOW_BROWSER_NETWORK_STEP_TYPES)[number];

export function isFlowBrowserNetworkStepType(
  stepType: string | undefined,
): stepType is FlowBrowserNetworkStepType {
  return (
    stepType != null &&
    (FLOW_BROWSER_NETWORK_STEP_TYPES as readonly string[]).includes(stepType)
  );
}

/** True when the flow needs an E2E browser session (E2E, listener, or interceptor steps). */
export function flowNeedsBrowserRunner(
  steps: readonly { readonly stepType: string }[],
): boolean {
  return steps.some((step) => isFlowBrowserNetworkStepType(step.stepType));
}

/** Builds `{{env}}` / `$` resolution context from the flow's selected environment. */
export function buildFlowEnvironmentVariableContext(
  flow: TestSuiteFlow,
  environments: EnvironmentsFile,
  environmentIdOverride?: string | null,
  keyOptions: EnvironmentVariableKeyOptions = DEFAULT_ENVIRONMENT_VARIABLE_KEY_OPTIONS,
): Readonly<Record<string, string>> {
  const effectiveId = environmentIdOverride ?? flow.environmentId ?? null;
  const environment = getEnvironmentDefinition(environments.environments, effectiveId);
  if (!environment) {
    return {};
  }
  return environmentVariablesToMap(collectEnvironmentVariables(environment.nodes, keyOptions));
}

function resolveText(value: string, variableContext: Readonly<Record<string, string>>): string {
  return resolveTemplateVariables(value, { environment: variableContext });
}

function resolveKeyValueRows(
  rows: readonly TestSuiteKeyValuePair[] | undefined,
  variableContext: Readonly<Record<string, string>>,
): TestSuiteKeyValuePair[] {
  if (!rows?.length) {
    return [];
  }
  return rows.map((row) => ({
    ...row,
    key: resolveText(row.key, variableContext),
    value: resolveText(row.value, variableContext),
  }));
}

/** Applies environment / dynamic variable substitution to listener config fields. */
export function resolveHttpListenerStepConfig(
  cfg: HttpListenerStepConfig,
  variableContext: Readonly<Record<string, string>>,
): HttpListenerStepConfig {
  return {
    ...cfg,
    urlPattern: resolveText(cfg.urlPattern, variableContext),
    method: resolveText(cfg.method, variableContext),
  };
}

/** Applies environment / dynamic variable substitution to interceptor config fields. */
export function resolveHttpInterceptorStepConfig(
  cfg: HttpInterceptorStepConfig,
  variableContext: Readonly<Record<string, string>>,
): HttpInterceptorStepConfig {
  return {
    ...cfg,
    urlPattern: resolveText(cfg.urlPattern, variableContext),
    method: resolveText(cfg.method, variableContext),
    amendHeaders: resolveKeyValueRows(cfg.amendHeaders, variableContext),
    amendQueryParams: resolveKeyValueRows(cfg.amendQueryParams, variableContext),
    replacePostBody: cfg.replacePostBody
      ? resolveText(cfg.replacePostBody, variableContext)
      : cfg.replacePostBody,
  };
}

/** Payload for `START_HTTP_CAPTURE` in the E2E runner. */
export function buildHttpCaptureRegisterSpec(
  listenerId: string,
  cfg: HttpListenerStepConfig | HttpInterceptorStepConfig,
  mutate: boolean,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    listenerId,
    urlPattern: cfg.urlPattern,
    method: cfg.method,
    matchPhase: cfg.matchPhase ?? 'response',
    mutate,
  };

  if (!mutate) {
    return base;
  }

  const interceptor = cfg as HttpInterceptorStepConfig;
  return {
    ...base,
    interceptAction: interceptor.interceptAction ?? 'modify',
    amendHeaders: interceptor.amendHeaders ?? [],
    amendQueryParams: interceptor.amendQueryParams ?? [],
    replaceBodyType: interceptor.replaceBodyType ?? 'none',
    replacePostBody: interceptor.replacePostBody ?? '',
  };
}

/** Converts E2E CDP capture data into a flow HTTP response capture. */
export function buildHttpCaptureFromE2eData(data: unknown): FlowStepHttpResponseCapture {
  const cap =
    data && typeof data === 'object'
      ? (data as {
          url?: string;
          method?: string;
          status?: number;
          body?: string;
          headers?: Record<string, string>;
          requestHeaders?: Record<string, string>;
          requestBody?: string;
        })
      : {};

  const headers: Record<string, string> = {};
  if (cap.headers && typeof cap.headers === 'object') {
    for (const [key, value] of Object.entries(cap.headers)) {
      headers[key] = String(value ?? '');
    }
  }

  const statusCode = Number(cap.status) || 0;
  const bodyText = String(cap.body ?? cap.requestBody ?? '');

  return flowStepHttpResponseCaptureSchema.parse({
    kind: 'http_response',
    capturedAt: new Date().toISOString(),
    statusCode,
    statusText: statusCode > 0 ? String(statusCode) : '',
    bodyText,
    headers,
    requestMethod: cap.method ? String(cap.method) : undefined,
    requestUrl: cap.url ? String(cap.url) : undefined,
  });
}
