import { describe, expect, it } from 'vitest';

import type { HttpMethodId } from '../config/http-settings.schema';

import {
  findMockEndpoint,
  matchMockEndpoint,
  matchMockHeadersAndBody,
  matchMockRoute,
  matchMockRule,
  parseIncomingMockRequest,
} from './mock-server-match';
import {
  createDefaultMockRuleMatcher,
  createDefaultMockServerEndpoint,
  type MockRuleMatcher,
  type MockServerEndpoint,
  type MockServerTreeItem,
} from './mock-server.schema';

describe('mock-server-match', () => {
  const ts = '2024-01-01T00:00:00.000Z';

  it('matches method and exact path', () => {
    const matcher: MockRuleMatcher = {
      ...createDefaultMockRuleMatcher('m1'),
      methods: ['GET'],
      path: { mode: 'exact', value: '/api', ignoreQuery: false },
    };
    const req = parseIncomingMockRequest({
      method: 'GET',
      url: '/api',
      headers: {},
    });
    expect(matchMockRule(matcher, req)).toBe(true);
    expect(
      matchMockRule(matcher, parseIncomingMockRequest({ method: 'POST', url: '/api', headers: {} })),
    ).toBe(false);
  });

  it('matches prefix path', () => {
    const matcher = {
      ...createDefaultMockRuleMatcher('m1'),
      path: { mode: 'prefix' as const, value: '/v1', ignoreQuery: true },
    };
    const req = parseIncomingMockRequest({
      method: 'GET',
      url: '/v1/users',
      headers: {},
    });
    expect(matchMockRule(matcher, req)).toBe(true);
  });

  it('matches endpoint route on first matcher then header rules', () => {
    const endpoint: MockServerEndpoint = {
      ...createDefaultMockServerEndpoint('e1', 'API', ts),
      matchers: [
        {
          ...createDefaultMockRuleMatcher('route'),
          methods: ['POST'],
          path: { mode: 'exact', value: '/hooks', ignoreQuery: false },
        },
        {
          ...createDefaultMockRuleMatcher('json'),
          methods: [],
          path: { mode: 'exact', value: '/unused', ignoreQuery: false },
          headers: [
            {
              id: 'h1',
              enabled: true,
              key: 'Content-Type',
              value: 'application/json',
              match: 'contains',
            },
          ],
        },
      ],
    };

    const req = parseIncomingMockRequest({
      method: 'POST',
      url: '/hooks',
      headers: { 'Content-Type': 'application/json' },
      bodyText: '{}',
    });

    expect(matchMockRoute(endpoint.matchers[0]!, req)).toBe(true);
    expect(matchMockHeadersAndBody(endpoint.matchers[1]!, req)).toBe(true);
    expect(matchMockEndpoint(endpoint, req)).toBe(true);
    expect(
      matchMockEndpoint(
        endpoint,
        parseIncomingMockRequest({
          method: 'POST',
          url: '/hooks',
          headers: { 'Content-Type': 'text/plain' },
        }),
      ),
    ).toBe(false);
  });

  it('finds endpoint by priority', () => {
    const low: MockServerEndpoint = {
      ...createDefaultMockServerEndpoint('e-low', 'Low', ts),
      priority: 10,
      matchers: [
        {
          ...createDefaultMockRuleMatcher('m-low'),
          path: { mode: 'prefix', value: '/', ignoreQuery: true },
        },
      ],
    };
    const high: MockServerEndpoint = {
      ...createDefaultMockServerEndpoint('e-high', 'High', ts),
      priority: 0,
      matchers: [
        {
          ...createDefaultMockRuleMatcher('m-high'),
          methods: ['GET'] satisfies HttpMethodId[],
          path: { mode: 'exact', value: '/special', ignoreQuery: false },
        },
      ],
      response: {
        ...createDefaultMockServerEndpoint('e-high', 'High', ts).response,
        statusCode: 201,
      },
    };

    const items: MockServerTreeItem[] = [low, high];
    const req = parseIncomingMockRequest({ method: 'GET', url: '/special', headers: {} });
    const found = findMockEndpoint(items, req);
    expect(found?.id).toBe('e-high');
    expect(found?.response.statusCode).toBe(201);
  });
});
