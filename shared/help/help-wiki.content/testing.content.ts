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
          'Lookups — ticket identifiers to database queries and a labeled results card.',
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
          'Flow tabs use Overview (summary), Steps (tree, editor, run log), and Settings (tags, E2E, dataset).',
          'Right-click a step to add a new step after it, clone it, or delete it. Right-click empty space in the step tree to add at the end.',
          'Section layout (Sidebar vs Tabs) is under Settings → Test Suite → Editor layout.',
          'Run the flow to execute steps sequentially with pass/fail status.',
          'Open Call graph from the Test Suite sidebar to see which flows TRIGGER which (folder targets expand to descendants).',
          'Enable a flow dataset (CSV/JSON, max 50 rows) on Settings to re-run the whole flow per row. Nested TRIGGER children do not re-expand their own dataset.',
          'Right-click a step to run from this step or run to here. HTTP/DB skip earlier steps; E2E replays preceding browser steps first.',
          'Switch the Steps section to Diagram for an IF flowchart (diamonds, Then/Else columns). Sequential steps wrap into rows. Scroll to zoom, drag the canvas to pan, or use Fit.',
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
          'REQUEST — send an HTTP request from the step config. URLs, headers, and bodies can include {{placeholders}} cached earlier in this run, including from a sibling flow a parent TRIGGER already ran.',
          'VALIDATION — assert on a prior step (status, body, headers, cached value). Expected can include {{placeholders}} from the environment or earlier CACHE steps.',
          'CACHE — generate a value ($uuid, templates) or extract from a prior step into {{variables}} for later REQUEST, E2E, DATABASE, and other steps. Type the alias as email (not {{email}}). Each entry can encrypt or decrypt with RSA OAEP SHA-1 (PEM + private-key password, typically {{rsaPrivateKey}} and {{pemPassword}}) before storing.',
          'DATABASE — write SQL/Redis inline, or select a saved query from the Database sidebar.',
          'E2E — browser automation screenshot/step (when configured). Pick on page runs preceding steps, then attaches a CSS selector overlay. If the overlay cannot attach, the E2E window closes instead of staying stuck. Cancel pick aborts prep or picking. After login, use Wait for URL for the redirect (substring like /home); Navigate to URL is for opening a different page in the same session.',
          'HTTP_LISTENER — start listening in the background for matching browser HTTP traffic. Later VALIDATION or CACHE steps wait for the first match.',
          'HTTP_INTERCEPTOR — arm intercept rules in the background so later E2E traffic is modified or blocked. Later VALIDATION or CACHE steps wait for the first match.',
          'WAIT — pause for a duration.',
          'MANUAL — set a flow variable or manual checkpoint.',
          'TRIGGER — run another flow, or every descendant flow under a folder (fail-fast). Nested runs inherit variables and captures, so a later target can use {{vars}} cached by an earlier target in the same parent. The run log lists triggered steps under the TRIGGER row (expand/collapse). Cycles are rejected. Reuse E2E browser session (on by default) keeps the same window, cookies, and login for later steps. Triggered flows with E2E steps show the runner when Show E2E is enabled on this flow or the target.',
          'Skip unless on any step is under the action fields (collapsed until opened).',
          'VALIDATION — Continue on failure records the step as failed and keeps running; the flow still fails at the end.',
          'E2E SCREENSHOT checkpoints compare against a per-profile baseline in e2e-checkpoints/{flowId}/{stepId}.png (not Git). First run writes the baseline. Optional selector crops the element. Update baseline after a failed compare. Share baselines by copying that folder.',
        ],
      },
      {
        type: 'note',
        title: 'RSA OAEP CACHE cipher',
        text: 'Java services that use Cipher.getInstance("RSA/ECB/OAEPWithSHA-1AndMGF1Padding") interoperate with Testrix RSA OAEP (standard Base64, UTF-8 plaintext). Encrypt a generated or extracted password before an HTTP send, or decrypt a response field and validate it against {{plainPw}}.',
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
        text: 'Regression artifacts capture expected behavior across flows or captures. Re-run to compare results and review step-level diffs. Workspace tabs use section navigation; layout is under Settings → Regression. Linked E2E flows always run with the browser hidden so a large suite does not open one window per flow.',
      },
      {
        type: 'list',
        items: [
          'Recovered retries count as flaked (amber), not failed, unless you turn on Count flakes as failed.',
          'A failed critical flow fails acceptance even when the pass rate is above the threshold.',
          'Link a Test Suite folder so descendant flows stay synced; extra flows outside the folder stay linked.',
          'Pin a golden run on the artifact. Compare defaults to that pin versus the latest run.',
          'History shows pass-rate and p95 duration across stored runs. Export HTML next to Copy report.',
          'Reuse E2E session forces sequential runs and keeps one browser until the artifact finishes. Optional bootstrap flow runs first and counts in the pass rate.',
          'Flow datasets expand to one result per row (retry/flake apply per row).',
        ],
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
        text: 'Capture opens an embedded browser session and logs HTTP traffic. Session tabs have Overview (summary, start URL) and Traffic sections. Layout is under Settings → Capture. Filter the log, multi-select rows, and Generate a collection folder, a Test Suite flow of REQUEST + VALIDATION pairs, an OpenAPI spec, or mock endpoints. Duplicate method+path rows are collapsed and hop-by-hop headers are stripped. Seed rules from last run on a VALIDATION step uses the same capture helper.',
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
  wikiSection({
    id: 'lookups',
    groupId: 'testing',
    label: 'Lookups',
    icon: 'search',
    title: 'Lookups',
    description: 'Customer debug playbooks: identifiers to database queries to a results card.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Lookups live in the Testing hub. Each playbook has an environment, named inputs (email, UUID, MSISDN), sequential query steps, and a labeled results card. Steps can skip unless a source value matches a JavaScript regex (empty pattern always runs).',
      },
      {
        type: 'list',
        items: [
          'Pick an environment on the playbook, then override it on Run for staging vs production tickets.',
          'Each query step selects a Database sidebar connection. Saved queries can supply SQL; the step can still override the connection.',
          'Skip unless uses a source (`input.email`, `var.uuid`) and a JavaScript regex. Leave the regex empty to always run the step.',
          'SQL uses {{placeholders}} from environment variables, form inputs, and extracted fields.',
          'Result values that are JSON arrays or objects show as a table or list. Extract `$` or `$.products` (or the full query) into a variable, then put `{{products}}` on the results card.',
          'Empty query rows skip extracts unless the step is marked required.',
          'lookups.json stays local to the profile and is not Git-synced.',
        ],
      },
    ],
  }),
];
