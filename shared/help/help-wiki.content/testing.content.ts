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
          'Open a flow tab to edit steps, variables, and settings.',
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
          'DATABASE — run SQL against a configured connection.',
          'E2E — browser automation screenshot/step (when configured).',
          'HTTP_LISTENER — wait for an incoming HTTP callback.',
          'HTTP_INTERCEPTOR — apply intercept rules during the step.',
          'WAIT — pause for a duration.',
          'MANUAL — set a flow variable or manual checkpoint.',
          'TRIGGER — start another flow or external trigger.',
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
        text: 'Define load test artifacts with targets (collection request or manual URL), concurrency/duration profiles, and run to collect latency and throughput metrics.',
      },
      {
        type: 'list',
        items: [
          'Compare runs to spot regressions in p95 latency or error rate.',
          'Manual targets support custom headers and body without a collection request.',
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
        text: 'Regression artifacts capture expected behavior across flows or captures. Re-run to compare results and review step-level diffs.',
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
        text: 'Capture opens an embedded browser session and logs HTTP traffic. Filter the log and open entries as new collection requests.',
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
        text: 'Define rules that match outbound URLs and proxy, block, or return mock responses. Enable the interceptor runtime from the sidebar to apply rules to Testrix HTTP traffic.',
      },
    ],
  }),
];
