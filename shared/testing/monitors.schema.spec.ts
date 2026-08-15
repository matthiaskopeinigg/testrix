import { describe, expect, it } from 'vitest';

import { isMonitorDue } from './monitor-schedule';
import {
  createDefaultMonitorsFile,
  findLoadTestArtifactInTree,
  parseMonitorsFile,
  prependMonitorResult,
} from './monitors.schema';

describe('monitors.schema', () => {
  it('fills defaults for invalid payloads', () => {
    expect(parseMonitorsFile(null)).toEqual(createDefaultMonitorsFile());
  });

  it('caps stored results', () => {
    const results = prependMonitorResult(
      [{ id: 'old', monitorId: 'm1', startedAt: 'a', finishedAt: 'b', ok: true, message: '' }],
      { id: 'new', monitorId: 'm1', startedAt: 'c', finishedAt: 'd', ok: false, message: 'fail' },
      2,
    );
    expect(results.map((row) => row.id)).toEqual(['new', 'old']);
  });

  it('finds nested load-test artifacts', () => {
    const artifact = findLoadTestArtifactInTree(
      [
        {
          id: 'folder',
          name: 'Folder',
          updatedAt: '2020-01-01T00:00:00.000Z',
          children: [
            {
              id: 'lt-1',
              name: 'API',
              description: '',
              tags: [],
              docs: '',
              targetSource: 'manual',
              profile: { durationSec: 1, virtualUsers: 1, rampUpSec: 0 },
              thresholds: {},
              runs: [],
              updatedAt: '2020-01-01T00:00:00.000Z',
            },
          ],
        },
      ],
      'lt-1',
    );
    expect(artifact?.name).toBe('API');
  });
});

describe('isMonitorDue', () => {
  it('fires when nextRunAt is in the past', () => {
    expect(
      isMonitorDue(
        {
          id: 'm1',
          name: 'Ping',
          cron: '* * * * *',
          enabled: true,
          targetKind: 'request',
          targetId: 'req-1',
          nextRunAt: '2020-01-01T00:00:00.000Z',
        },
        new Date('2020-01-01T00:01:00.000Z'),
      ),
    ).toBe(true);
  });

  it('skips disabled monitors', () => {
    expect(
      isMonitorDue(
        {
          id: 'm1',
          name: 'Ping',
          cron: '* * * * *',
          enabled: false,
          targetKind: 'request',
          targetId: 'req-1',
          nextRunAt: '2020-01-01T00:00:00.000Z',
        },
        new Date('2020-01-01T00:01:00.000Z'),
      ),
    ).toBe(false);
  });
});
