import { describe, expect, it } from 'vitest';

import { createDefaultRegressionsFile } from './regressions.schema';
import { createDefaultTestSuitesFile } from './test-suites.schema';

import {
  DEMO_BULK_FLOW_COUNT_DEFAULT,
  DEMO_FLOW_IDS,
  DEMO_REGRESSION_BULK_ID,
  DEMO_REGRESSION_SMOKE_ID,
  demoBulkFlowIds,
  mergeDemoPublicApiRegressions,
  mergeDemoPublicApiTestSuites,
} from './demo-public-api.fixture';

describe('demo-public-api.fixture', () => {
  it('merges demo flows into test suites', () => {
    const merged = mergeDemoPublicApiTestSuites(createDefaultTestSuitesFile());
    const root = merged.suites[0]!;
    const folder = root.flows.find((item) => 'children' in item && item.id === 'demo_api_folder');
    expect(folder).toBeDefined();
    if (folder && 'children' in folder) {
      expect(folder.children).toHaveLength(3);
      expect(folder.children.map((flow) => flow.id)).toEqual([...DEMO_FLOW_IDS]);
    }
  });

  it('merges demo regression with linked flows', () => {
    const merged = mergeDemoPublicApiRegressions(createDefaultRegressionsFile());
    const folder = merged.items.find((item) => !('profile' in item) && item.id === 'demo_regression_folder');
    expect(folder).toBeDefined();
    if (folder && !('profile' in folder)) {
      const artifact = folder.children[0];
      expect(artifact?.id).toBe(DEMO_REGRESSION_SMOKE_ID);
      if (artifact && 'flowIds' in artifact) {
        expect(artifact.flowIds).toEqual([...DEMO_FLOW_IDS]);
      }
    }
  });

  it('is idempotent when run twice', () => {
    const once = mergeDemoPublicApiTestSuites(createDefaultTestSuitesFile());
    const twice = mergeDemoPublicApiTestSuites(once);
    expect(twice.suites[0]!.flows.filter((item) => 'children' in item && item.id === 'demo_api_folder')).toHaveLength(1);
  });

  it('merges bulk flows when bulkFlowCount is set', () => {
    const merged = mergeDemoPublicApiTestSuites(createDefaultTestSuitesFile(), undefined, {
      bulkFlowCount: 400,
    });
    const bulkFolder = merged.suites[0]!.flows.find(
      (item) => 'children' in item && item.id === 'demo_bulk_folder',
    );
    expect(bulkFolder).toBeDefined();
    if (bulkFolder && 'children' in bulkFolder) {
      const flowCount = bulkFolder.children.reduce((count, child) => {
        if ('nodes' in child) {
          return count + 1;
        }
        return count + child.children.length;
      }, 0);
      expect(flowCount).toBe(400);
    }
  });

  it('merges bulk regression with 400 linked flows', () => {
    const merged = mergeDemoPublicApiRegressions(createDefaultRegressionsFile(), undefined, {
      bulkFlowCount: 400,
    });
    const folder = merged.items.find((item) => !('profile' in item) && item.id === 'demo_regression_folder');
    expect(folder).toBeDefined();
    if (folder && !('profile' in folder)) {
      const bulk = folder.children.find((item) => item.id === DEMO_REGRESSION_BULK_ID);
      expect(bulk && 'flowIds' in bulk ? bulk.flowIds.length : 0).toBe(400);
      expect(bulk && 'flowIds' in bulk ? bulk.flowIds[0] : '').toBe(demoBulkFlowIds(400)[0]);
      expect(bulk && 'flowIds' in bulk ? bulk.flowIds[399] : '').toBe(demoBulkFlowIds(400)[399]);
    }
  });

  it('defaults bulk count constant to 400', () => {
    expect(DEMO_BULK_FLOW_COUNT_DEFAULT).toBe(400);
  });
});
