import type { LoadTestArtifact, LoadTestRunRecord } from './load-tests.schema';

export interface LoadTestExportContext {
  readonly artifact: LoadTestArtifact;
  readonly record: LoadTestRunRecord;
  readonly targetUrl?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resolveTargetUrl(context: LoadTestExportContext): string {
  if (context.targetUrl?.trim()) {
    return context.targetUrl.trim();
  }
  return context.artifact.manualTarget?.url?.trim() || 'https://example.com';
}

/**
 * Builds a self-contained HTML report for a load-test run.
 */
export function generateLoadTestHtmlReport(context: LoadTestExportContext): string {
  const { artifact, record } = context;
  const env = record.environmentName?.trim() || record.environmentId || 'None';
  const thresholds = record.thresholdResults
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.label)}</td><td>${row.pass ? 'PASS' : 'FAIL'}</td><td>${escapeHtml(row.actual)}</td><td>${escapeHtml(row.expected)}</td></tr>`,
    )
    .join('');
  const samples = record.samples
    .map(
      (sample) =>
        `<tr><td>${sample.elapsedSec}</td><td>${sample.virtualUsers}</td><td>${sample.requestsPerSec.toFixed(1)}</td><td>${sample.p95LatencyMs}</td></tr>`,
    )
    .join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(artifact.name)} — load test report</title>
  <style>
    body { font-family: Segoe UI, sans-serif; margin: 2rem; color: #1b1b1b; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #d0d0d0; padding: 0.4rem 0.6rem; text-align: left; }
    .fail { color: #b42318; font-weight: 600; }
    .pass { color: #067647; font-weight: 600; }
  </style>
</head>
<body>
  <h1>${escapeHtml(artifact.name)}</h1>
  <p>Status: <strong>${escapeHtml(record.status)}</strong></p>
  <p>Target: ${escapeHtml(resolveTargetUrl(context))}</p>
  <p>Environment: ${escapeHtml(String(env))}</p>
  <p>Started: ${escapeHtml(record.startedAt)}${record.finishedAt ? ` · Finished: ${escapeHtml(record.finishedAt)}` : ''}</p>
  <h2>Summary</h2>
  <ul>
    <li>Success rate: ${record.summary.successRatePercent.toFixed(2)}%</li>
    <li>Error rate: ${record.summary.errorRatePercent.toFixed(2)}%</li>
    <li>Throughput: ${record.summary.requestsPerSec.toFixed(1)} rps (peak ${record.summary.peakRequestsPerSec.toFixed(1)})</li>
    <li>Latency p50/p95/p99: ${record.summary.latencyMs.p50} / ${record.summary.latencyMs.p95} / ${record.summary.latencyMs.p99} ms</li>
    <li>Requests: ${record.summary.totalRequests} (${record.summary.failedRequests} failed)</li>
    <li>Profile: ${record.profileSnapshot.virtualUsers} VUs · ${record.profileSnapshot.durationSec}s · ramp ${record.profileSnapshot.rampUpSec}s</li>
  </ul>
  <h2>Thresholds</h2>
  <table><thead><tr><th>Check</th><th>Result</th><th>Actual</th><th>Expected</th></tr></thead><tbody>${thresholds || '<tr><td colspan="4">None</td></tr>'}</tbody></table>
  <h2>RPS series</h2>
  <table><thead><tr><th>Elapsed s</th><th>VUs</th><th>RPS</th><th>p95 ms</th></tr></thead><tbody>${samples || '<tr><td colspan="4">No samples</td></tr>'}</tbody></table>
</body>
</html>`;
}

/**
 * Generates a k6 script from a load-test artifact.
 */
export function generateK6Script(context: LoadTestExportContext): string {
  const { artifact, record } = context;
  const url = resolveTargetUrl(context);
  const method = (artifact.manualTarget?.method ?? 'GET').toUpperCase();
  const duration = `${record.profileSnapshot.durationSec}s`;
  const vus = record.profileSnapshot.virtualUsers;
  const thresholds: string[] = [];
  if (record.thresholdsSnapshot.maxP95LatencyMs != null) {
    thresholds.push(`'http_req_duration': ['p(95)<${record.thresholdsSnapshot.maxP95LatencyMs}']`);
  }
  if (record.thresholdsSnapshot.maxErrorRatePercent != null) {
    thresholds.push(`'http_req_failed': ['rate<${record.thresholdsSnapshot.maxErrorRatePercent / 100}']`);
  }
  return `import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: ${vus},
  duration: '${duration}',
  ${record.profileSnapshot.rampUpSec > 0 ? `stages: [{ duration: '${record.profileSnapshot.rampUpSec}s', target: ${vus} }, { duration: '${duration}', target: ${vus} }],` : ''}
  thresholds: {
    ${thresholds.join(',\n    ')}
  },
};

export default function () {
  const res = http.${method === 'GET' ? 'get' : 'request'}(${method === 'GET' ? `'${url}'` : `'${method}', '${url}'`});
  check(res, { 'status is 2xx': (r) => r.status >= 200 && r.status < 300 });
  sleep(1);
}
`;
}

/**
 * Generates a Gatling Scala simulation stub from a load-test artifact.
 */
export function generateGatlingSimulation(context: LoadTestExportContext): string {
  const { artifact, record } = context;
  const url = resolveTargetUrl(context);
  const method = (artifact.manualTarget?.method ?? 'GET').toLowerCase();
  const className = artifact.name.replace(/[^A-Za-z0-9]/g, '') || 'TestrixSimulation';
  return `import io.gatling.core.Predef._
import io.gatling.http.Predef._
import scala.concurrent.duration._

class ${className} extends Simulation {
  val httpProtocol = http.baseUrl("${url.replace(/\/$/, '')}")
  val scn = scenario("${artifact.name.replace(/"/g, '')}")
    .exec(http("request").${method}("/"))

  setUp(
    scn.inject(rampUsers(${record.profileSnapshot.virtualUsers}).during(${Math.max(1, record.profileSnapshot.rampUpSec)}.seconds))
  ).protocols(httpProtocol).maxDuration(${record.profileSnapshot.durationSec}.seconds)
}
`;
}
