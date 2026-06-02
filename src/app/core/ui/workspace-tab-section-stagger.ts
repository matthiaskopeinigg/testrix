/** Block counts for request workspace tab section shells (`tx-entrance-stagger__block` children). */
export function requestTabSectionBlockCount(section: string): number {
  switch (section) {
    case 'auth':
      return 2;
    default:
      return 1;
  }
}

/** Block counts for folder workspace tab section shells. */
export function folderTabSectionBlockCount(section: string): number {
  switch (section) {
    case 'variables':
    case 'headers':
    case 'auth':
      return 2;
    case 'script':
      return 3;
    default:
      return 1;
  }
}

/** Block counts for WebSocket workspace tab section shells. */
export function websocketTabSectionBlockCount(section: string): number {
  switch (section) {
    case 'params':
    case 'auth':
    case 'headers':
    case 'message':
      return 2;
    case 'scripts':
      return 3;
    default:
      return 1;
  }
}

/** Block counts for load-test workspace tab section shells. */
export function loadTestTabSectionBlockCount(section: string): number {
  switch (section) {
    case 'target':
      return 2;
    default:
      return 1;
  }
}

/** Block counts for mock server endpoint workspace tab section shells. */
export function mockServerTabSectionBlockCount(section: string): number {
  switch (section) {
    default:
      return 1;
  }
}

/** Block counts for capture workspace tab section shells. */
export function captureTabSectionBlockCount(_section: string): number {
  return 1;
}

/** Block counts for interceptor rule workspace tab section shells. */
export function interceptorRuleTabSectionBlockCount(_section: string): number {
  return 1;
}

/** Block counts for test-suite flow workspace tab section shells. */
export function testSuiteTabSectionBlockCount(section: string): number {
  switch (section) {
    case 'overview':
      return 1;
    default:
      return 1;
  }
}

export function regressionTabSectionBlockCount(section: string): number {
  switch (section) {
    case 'flows':
      return 2;
    case 'results':
      return 3;
    default:
      return 1;
  }
}
