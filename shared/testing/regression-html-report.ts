import { countRegressionFlakedFlows } from './regression-flake';
import {
  compareRegressionFlowResults,
  type RegressionFlowDiff,
} from './regression-flow-diff';
import type { RegressionArtifact } from './regressions.schema';
import type { RegressionRun } from './regression-run.schema';

/** Inputs for a self-contained regression HTML report. */
export interface RegressionHtmlReportContext {
  readonly artifact: Pick<RegressionArtifact, 'name' | 'release'>;
  readonly record: RegressionRun;
  readonly compareRecord?: RegressionRun | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) {
    return '—';
  }
  return `${Math.round(ms)} ms`;
}

function flowRows(record: RegressionRun): string {
  return record.flowResults
    .map((flow) => {
      const flake = flow.flaked ? ' (flaked)' : '';
      const critical = flow.isCritical ? ' (critical)' : '';
      return `<tr>
        <td>${escapeHtml(flow.flowName)}${critical}</td>
        <td>${escapeHtml(flow.status)}${flake}</td>
        <td>${formatDuration(flow.durationMs)}</td>
        <td>${flow.attemptCount}</td>
        <td>${escapeHtml(flow.message ?? '')}</td>
      </tr>`;
    })
    .join('');
}

function thresholdRows(record: RegressionRun): string {
  if (record.thresholdResults.length === 0) {
    return '<tr><td colspan="4">None</td></tr>';
  }
  return record.thresholdResults
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.label)}</td><td class="${row.pass ? 'pass' : 'fail'}">${
          row.pass ? 'PASS' : 'FAIL'
        }</td><td>${escapeHtml(row.actual)}</td><td>${escapeHtml(row.expected)}</td></tr>`,
    )
    .join('');
}

function diffRows(diffs: readonly RegressionFlowDiff[]): string {
  if (diffs.length === 0) {
    return '<tr><td colspan="4">No flow differences</td></tr>';
  }
  return diffs
    .map(
      (row) =>
        `<tr>
          <td>${escapeHtml(row.flowName)}</td>
          <td>${escapeHtml(row.statusA ?? '—')}</td>
          <td>${escapeHtml(row.statusB ?? '—')}</td>
          <td>${escapeHtml(row.changeType.replace(/_/g, ' '))}</td>
        </tr>`,
    )
    .join('');
}

/**
 * Builds a self-contained HTML report for a regression run.
 * Includes flake counts, flow table, thresholds, and optional compare diffs.
 */
export function generateRegressionHtmlReport(context: RegressionHtmlReportContext): string {
  const { artifact, record, compareRecord } = context;
  const flaked = record.flakedCount ?? countRegressionFlakedFlows(record.flowResults);
  const summary = record.summary;
  const diffs = compareRecord
    ? compareRegressionFlowResults(compareRecord.flowResults, record.flowResults)
    : [];
  const compareSection = compareRecord
    ? `<h2>Compare vs ${escapeHtml(compareRecord.startedAt)}</h2>
<table><thead><tr><th>Flow</th><th>Status A</th><th>Status B</th><th>Change</th></tr></thead>
<tbody>${diffRows(diffs)}</tbody></table>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(artifact.name)} — regression report</title>
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
  ${artifact.release ? `<p>Release: ${escapeHtml(artifact.release)}</p>` : ''}
  <p>Started: ${escapeHtml(record.startedAt)}${
    record.finishedAt ? ` · Finished: ${escapeHtml(record.finishedAt)}` : ''
  }</p>
  <h2>Summary</h2>
  <ul>
    <li>Passed: ${record.passedCount}</li>
    <li>Flaked: ${flaked}</li>
    <li>Failed: ${record.failedCount}</li>
    <li>Skipped: ${record.skippedCount}</li>
    ${
      summary
        ? `<li>Pass rate: ${summary.passRatePercent.toFixed(1)}% (acceptance ≥ ${summary.acceptancePercent}%)</li>
    <li>Meets acceptance: ${summary.meetsAcceptance ? 'yes' : 'no'}</li>
    <li>p95 flow duration: ${formatDuration(summary.p95FlowDurationMs)}</li>`
        : ''
    }
  </ul>
  <h2>Thresholds</h2>
  <table><thead><tr><th>Check</th><th>Result</th><th>Actual</th><th>Expected</th></tr></thead>
  <tbody>${thresholdRows(record)}</tbody></table>
  <h2>Flows</h2>
  <table><thead><tr><th>Flow</th><th>Status</th><th>Duration</th><th>Attempts</th><th>Message</th></tr></thead>
  <tbody>${flowRows(record) || '<tr><td colspan="5">None</td></tr>'}</tbody></table>
  ${compareSection}
</body>
</html>`;
}
