import { describe, expect, it } from 'vitest';

import {
  parseCollectionWebSocketConfig,
  parseWebsocketProtocols,
  websocketTabSlideDir,
} from './collection-websocket';

describe('parseCollectionWebSocketConfig', () => {
  it('fills defaults for an empty object', () => {
    const parsed = parseCollectionWebSocketConfig({});
    expect(parsed.url).toBe('');
    expect(parsed.authMode).toBe('inherit');
    expect(parsed.headers).toEqual([]);
  });
});

describe('websocketTabSlideDir', () => {
  it('slides right toward later tabs', () => {
    expect(websocketTabSlideDir('messages', 'headers')).toBe('right');
    expect(websocketTabSlideDir('docs', 'params')).toBe('left');
  });
});

describe('parseWebsocketProtocols', () => {
  it('splits a comma list', () => {
    expect(parseWebsocketProtocols(' chat , json ')).toEqual(['chat', 'json']);
  });
});
