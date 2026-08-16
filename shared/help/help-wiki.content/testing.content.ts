import { wikiSection } from '../help-wiki.builders';
import type { HelpWikiSection } from '../help-wiki.schema';

export const HELP_WIKI_TESTING_SECTIONS: readonly HelpWikiSection[] = [
  wikiSection({
    id: 'testing-hub',
    groupId: 'testing',
    label: 'Testing hub',
    icon: 'testing',
    title: 'Testing hub',
    description: 'Entry menu for all testing tools.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Open Testing in the sidebar to reach the hub menu. Each tile drills into a dedicated panel and workspace tabs.',
      },
      {
        type: 'list',
        items: [
          'Regression — saved regression runs and comparisons.',
          'Test Suite — folders, flows, and step-based automation.',
          'Load Test — performance targets, profiles, and run history.',
          'Mock Server — local HTTP stubs and matchers.',
          'Capture — embedded browser traffic log.',
          'Interceptor — proxy/block/mock rules for outbound HTTP.',
          'Monitors — local cron that runs a request, flow, or load test while Testrix is open.',
        ],
      },
    ],
  }),
  wikiSection({
    id: 'test-suite',
    groupId: 'testing',
    label: 'Test Suite',
    icon: 'testing',
    title: 'Test Suite',
    description: 'Folders, flows, and running tests.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Organize automation in folders and flows. Each flow is a ordered tree of steps with run configuration and live log output.',
      },
      {
        type: 'list',
        items: [
          'Create folders and flows from the Test Suite sidebar.',
          'Flow tabs use Overview (metadata, settings) and Steps (step tree, editor, run log) sections.',
          'Section layout (Sidebar vs Tabs) is under Settings → Test Suite → Editor layout.',
          'Run the flow to execute steps sequentially with pass/fail status.',
        ],
      },
    ],
  }),
  wikiSection({
    id: 'test-suite-steps',
    groupId: 'testing',
    label: 'Test Suite steps',
    icon: 'layers',
    title: 'Test Suite step types',
    description: 'All supported flow step kinds.',
    blocks: [
      {
        type: 'list',
        items: [
          'REQUEST — send an HTTP request from the step config.',
          'VALIDATION — assert on prior step response (status, body, headers).',
          'CACHE — generate a value ($uuid, templates) or extract from a prior step into {{variables}} for later E2E and DATABASE steps.',
          'DATABASE — write SQL/Redis inline, or select a saved query from the Database sidebar.',
          'E2E — browser automation screenshot/step (when configured).',
          'HTTP_LISTENER — wait for an incoming HTTP callback.',
          'HTTP_INTERCEPTOR — apply intercept rules during the step.',
          'WAIT — pause for a duration.',
          'MANUAL — set a flow variable or manual checkpoint.',
          'TRIGGER — run another flow, or every descendant flow under a folder (fail-fast). Nested runs inherit variables and captures; cycles are rejected.',
        ],
      },
    ],
  }),
  wikiSection({
    id: 'load-test',
    groupId: 'testing',
    label: 'Load Test',
    icon: 'zap',
    title: 'Load Test',
    description: 'Targets, profiles, metrics, and compare.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Define load test artifacts with targets (collection request or manual URL), concurrency/duration profiles, and run to collect latency and throughput metrics. Workspace tabs support section navigation; layout is under Settings → Load Test.',
      },
      {
        type: 'list',
        items: [
          'Pick an environment on the Target section (inherit from the collection request, none, or a specific profile). Manual targets use the selected environment for {{variables}}.',
          'Compare runs to spot regressions in p95 latency or error rate.',
          'Manual targets support custom headers and body without a collection request.',
          'From Results, export a self-contained HTML report (includes environment name), a k6 script, or a Gatling Simulation stub.',
        ],
      },
    ],
  }),
  wikiSection({
    id: 'regression',
    groupId: 'testing',
    label: 'Regression',
    icon: 'target',
    title: 'Regression',
    description: 'Saved regressions, scope, and diffs.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Regression artifacts capture expected behavior across flows or captures. Re-run to compare results and review step-level diffs. Workspace tabs use section navigation; layout is under Settings → Regression.',
      },
    ],
  }),
  wikiSection({
    id: 'mock-server',
    groupId: 'testing',
    label: 'Mock Server',
    icon: 'api',
    title: 'Mock Server',
    description: 'Endpoints, matchers, CORS, and history capture.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Run a local HTTP server that matches incoming requests to configured endpoints and returns stub responses.',
      },
      {
        type: 'list',
        items: [
          'Tree of folders and endpoints with priority and matchers (method, path, headers, body).',
          'Configure port, host, delay, and CORS in sidebar options.',
          'Optional capture of hits and unmatched requests to History.',
          'Start/stop from the sidebar; auto-start on launch in options.',
          'Endpoint tabs use section navigation; layout is under Settings → Mock Server.',
        ],
      },
    ],
  }),
  wikiSection({
    id: 'capture',
    groupId: 'testing',
    label: 'Capture',
    icon: 'globe',
    title: 'Capture',
    description: 'Embedded browser and traffic log.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Capture opens an embedded browser session and logs HTTP traffic. Session tabs have Overview (summary, start URL) and Traffic sections. Layout is under Settings → Capture. Filter the log, multi-select rows, and Generate a collection folder, OpenAPI spec, or mock endpoints. Duplicate method+path rows are collapsed and hop-by-hop headers are stripped.',
      },
    ],
  }),
  wikiSection({
    id: 'interceptor',
    groupId: 'testing',
    label: 'Interceptor',
    icon: 'interceptor',
    title: 'Interceptor',
    description: 'Proxy, block, and mock rules.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Define rules that match outbound URLs and proxy, block, or return mock responses. Rule tabs use Overview, Match, and Action sections. Layout is under Settings → Interceptor. Enable the interceptor runtime from the sidebar to apply rules to Testrix HTTP traffic.',
      },
    ],
  }),
  wikiSection({
    id: 'monitors',
    groupId: 'testing',
    label: 'Monitors',
    icon: 'clock',
    title: 'Local monitors',
    description: 'Cron-scheduled request, flow, and load-test runs while the app is open.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Monitors live in the Testing hub and run only while Testrix is open. Each monitor has a cron expression, a target (collection request, test-suite flow, or load test), and an optional environment override.',
      },
      {
        type: 'list',
        items: [
          'Failures show a desktop notification and a compact log on the Monitors panel.',
          'Load-test monitors skip if that load test is already running.',
          'Use the Cron development tool’s “Use in monitor…” action to prefill an expression.',
          'monitors.json stays local to the profile and is not Git-synced.',
        ],
      },
    ],
  }),
];
