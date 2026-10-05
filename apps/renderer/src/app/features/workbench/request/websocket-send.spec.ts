import { describe, expect, it } from 'vitest';

import { DEFAULT_FOLDER_AUTH } from '@testrix/contracts';

import { planWebsocketConnect } from './websocket-send';

describe('planWebsocketConnect', () => {
  it('applies ws scheme, query, and headers', () => {
    const plan = planWebsocketConnect({
      tree: [],
      nodeId: 'ws1',
      connectionId: 'tab-1',
      url: 'localhost:8765/events',
      params: [{ id: 'q', enabled: true, key: 'room', value: 'ops', description: '' }],
      headers: [{ id: 'h', enabled: true, key: 'X-Trace', value: '1', description: '' }],
      protocols: 'json',
      authMode: 'none',
      requestAuth: DEFAULT_FOLDER_AUTH,
      envVars: {},
    });
    expect(plan.payload.url).toBe('ws://localhost:8765/events?room=ops');
    expect(plan.payload.headers.some((row) => row.key === 'X-Trace')).toBe(true);
    expect(plan.payload.protocols).toEqual(['json']);
  });
});
