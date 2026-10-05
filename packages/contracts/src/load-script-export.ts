import type { LoadArtifactFields, LoadRunRecord } from './load-file';
import { loadRunSummaryOf } from './load-run-diff';
import { escapeHtml } from './text-format';

/** Artifact plus a single run used to build export artifacts. */
export interface LoadExportContext {
  readonly artifact: LoadArtifactFields & { readonly id: string; readonly name: string };
  readonly run: LoadRunRecord;
  readonly targetUrl?: string;
}

function resolveTargetUrl(context: LoadExportContext): string {
  if (context.targetUrl?.trim())
    return context.targetUrl.trim();
  return context.artifact.url?.trim() || 'https://example.com';
}

/** Serializes a run record for export (clipboard or file). */
export function serializeLoadRunExport(run: LoadRunRecord): string {
  return JSON.stringify(run, null, 2);
}

/** Builds a plain-text report for a run record. */
export function buildLoadRunReport(context: LoadExportContext): string {
  const { artifact, run } = context;
  const summary = loadRunSummaryOf(run);
  const lines = [
    `Load test: ${artifact.name}`,
    `Run: ${run.id}`,
    `Status: ${run.status ?? (run.error ? 'failed' : 'passed')}`,
    `When: ${run.at}`,
    '',
    'Summary',
    `- Success rate: ${summary.successRatePercent.toFixed(2)}%`,
    `- Error rate: ${summary.errorRatePercent.toFixed(2)}%`,
    `- Throughput: ${summary.rps.toFixed(1)} rps (peak ${summary.peakRps.toFixed(1)} rps)`,
    `- Latency p50/p95/p99: ${summary.p50Ms} / ${summary.p95Ms} / ${summary.p99Ms} ms`,
    `- Total requests: ${summary.requests} (${summary.errors} failed)`,
    `- Profile: ${run.virtualUsers} VUs · ${(run.durationMs / 1000).toFixed(0)}s`,
  ];

  const thresholdResults = run.thresholdResults ?? [];
  if (thresholdResults.length > 0) {
    lines.push('', 'Thresholds');
    for (const result of thresholdResults)
      lines.push(`- ${result.label}: ${result.ok ? 'PASS' : 'FAIL'} (${result.actual} vs ${result.expected})`);
  }

  return lines.join('\n');
}

/** Builds a self-contained HTML report for a load-test run. */
export function generateLoadHtmlReport(context: LoadExportContext): string {
  const { artifact, run } = context;
  const summary = loadRunSummaryOf(run);
  const status = run.status ?? (run.error ? 'failed' : 'passed');
  const thresholds = (run.thresholdResults ?? [])
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.label)}</td><td class="${row.ok ? 'pass' : 'fail'}">${
          row.ok ? 'PASS' : 'FAIL'
        }</td><td>${escapeHtml(row.actual)}</td><td>${escapeHtml(row.expected)}</td></tr>`,
    )
    .join('');
  const samples = run.samples
    .map(
      (sample) =>
        `<tr><td>${(sample.elapsedSec ?? sample.elapsedMs / 1000).toFixed(1)}</td><td>${
          sample.virtualUsers ?? run.virtualUsers
        }</td><td>${sample.rps.toFixed(1)}</td><td>${Math.round(sample.p95Ms)}</td></tr>`,
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
  <p>Status: <strong>${escapeHtml(status)}</strong></p>
  <p>Target: ${escapeHtml(resolveTargetUrl(context))}</p>
  <p>When: ${escapeHtml(run.at)}</p>
  <h2>Summary</h2>
  <ul>
    <li>Success rate: ${summary.successRatePercent.toFixed(2)}%</li>
    <li>Error rate: ${summary.errorRatePercent.toFixed(2)}%</li>
    <li>Throughput: ${summary.rps.toFixed(1)} rps (peak ${summary.peakRps.toFixed(1)})</li>
    <li>Latency p50/p95/p99: ${summary.p50Ms} / ${summary.p95Ms} / ${summary.p99Ms} ms</li>
    <li>Requests: ${summary.requests} (${summary.errors} failed)</li>
    <li>Profile: ${run.virtualUsers} VUs · ${(run.durationMs / 1000).toFixed(0)}s</li>
  </ul>
  <h2>Thresholds</h2>
  <table><thead><tr><th>Check</th><th>Result</th><th>Actual</th><th>Expected</th></tr></thead><tbody>${
    thresholds || '<tr><td colspan="4">None</td></tr>'
  }</tbody></table>
  <h2>RPS series</h2>
  <table><thead><tr><th>Elapsed s</th><th>VUs</th><th>RPS</th><th>p95 ms</th></tr></thead><tbody>${
    samples || '<tr><td colspan="4">No samples</td></tr>'
  }</tbody></table>
</body>
</html>`;
}

/** Generates a k6 script from a load-test artifact and run. */
export function generateK6Script(context: LoadExportContext): string {
  const { artifact, run } = context;
  const url = resolveTargetUrl(context);
  const method = (artifact.method || 'GET').toUpperCase();
  const durationSec = Math.max(1, Math.round(run.durationMs / 1000));
  const duration = `${durationSec}s`;
  const vus = run.virtualUsers;
  const thresholds: string[] = [];
  if (artifact.maxP95Ms > 0)
    thresholds.push(`'http_req_duration': ['p(95)<${artifact.maxP95Ms}']`);
  if (artifact.maxErrorRate > 0)
    thresholds.push(`'http_req_failed': ['rate<${artifact.maxErrorRate / 100}']`);
  const rampUpSec = Math.max(0, artifact.rampUpSec);
  return `import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: ${vus},
  duration: '${duration}',
  ${rampUpSec > 0 ? `stages: [{ duration: '${rampUpSec}s', target: ${vus} }, { duration: '${duration}', target: ${vus} }],` : ''}
  thresholds: {
    ${thresholds.join(',\n    ')}
  },
};

export default function () {
  const res = http.${method === 'GET' ? 'get' : 'request'}(${
    method === 'GET' ? `'${url}'` : `'${method}', '${url}'`
  });
  check(res, { 'status is 2xx': (r) => r.status >= 200 && r.status < 300 });
  sleep(1);
}
`;
}

/** Generates a Gatling Scala simulation stub from a load-test artifact and run. */
export function generateGatlingSimulation(context: LoadExportContext): string {
  const { artifact, run } = context;
  const url = resolveTargetUrl(context);
  const method = (artifact.method || 'GET').toLowerCase();
  const className = artifact.name.replace(/[^A-Za-z0-9]/g, '') || 'TestrixSimulation';
  const durationSec = Math.max(1, Math.round(run.durationMs / 1000));
  return `import io.gatling.core.Predef._
import io.gatling.http.Predef._
import scala.concurrent.duration._

class ${className} extends Simulation {
  val httpProtocol = http.baseUrl("${url.replace(/\/$/, '')}")
  val scn = scenario("${artifact.name.replace(/"/g, '')}")
    .exec(http("request").${method}("/"))

  setUp(
    scn.inject(rampUsers(${run.virtualUsers}).during(${Math.max(1, artifact.rampUpSec)}.seconds))
  ).protocols(httpProtocol).maxDuration(${durationSec}.seconds)
}
`;
}
