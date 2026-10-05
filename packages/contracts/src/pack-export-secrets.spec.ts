import { describe, expect, it } from 'vitest';

import {
  analyzePackExportSecrets,
  formatPackSecretGroup,
  stripPackSecrets,
} from './pack-export-secrets';
import type { CollectionsFile } from './config-files';
import type { CookiesFile } from './cookies-file';
import type { DatabasesFile } from './database';
import type { EnvironmentsFile } from './environment';

describe('analyzePackExportSecrets', () => {
  it('finds secret environment variables and database passwords', () => {
    const environments: EnvironmentsFile = {
      schemaVersion: 1,
      activeId: 'env-1',
      items: [
        {
          id: 'env-1',
          name: 'Staging',
          variables: [
            {
              kind: 'variable',
              id: 'v1',
              key: 'API_TOKEN',
              value: 'tok_live',
              description: '',
              enabled: true,
              secret: true,
            },
            {
              kind: 'variable',
              id: 'v2',
              key: 'host',
              value: 'example.com',
              description: '',
              enabled: true,
              secret: false,
            },
          ],
        },
      ],
    };
    const databases: DatabasesFile = {
      schemaVersion: 1,
      nodes: [
        {
          id: 'db-1',
          name: 'Prod',
          type: 'postgresql',
          host: 'localhost',
          port: 5432,
          user: 'app',
          password: 's3cret',
          database: 'app',
        },
      ],
    };

    const report = analyzePackExportSecrets({
      selection: { categories: ['environments', 'database'] },
      environments,
      databases,
    });

    expect(report.total).toBe(2);
    expect(report.groups.map((group) => group.category)).toEqual(['environments', 'database']);
    expect(formatPackSecretGroup(report.groups[0]!)).toContain('Environments');
  });

  it('finds auth credentials on selected collection nodes only', () => {
    const collections: CollectionsFile = {
      schemaVersion: 1,
      collections: [
        {
          kind: 'http',
          id: 'req-1',
          name: 'Login',
          modifiedAt: '2020-01-01T00:00:00.000Z',
          method: 'POST',
          status: null,
          config: {
            authMode: 'override',
            auth: {
              type: 'bearer',
              token: 'abc',
              username: '',
              password: '',
              realm: '',
              apiKey: '',
              apiKeyHeader: 'X-Api-Key',
              apiKeyIn: 'header',
              grantType: 'authorization_code',
              pkce: true,
              codeChallengeMethod: 'S256',
              authUrl: '',
              tokenUrl: '',
              deviceAuthUrl: '',
              clientId: '',
              clientSecret: '',
              scope: '',
              audience: '',
              redirectUri: '',
              accessToken: '',
              refreshToken: '',
              tokenType: 'Bearer',
              expiresAt: '',
            },
          },
        },
        {
          kind: 'http',
          id: 'req-2',
          name: 'Skipped',
          modifiedAt: '2020-01-01T00:00:00.000Z',
          method: 'GET',
          status: null,
          config: {
            authMode: 'override',
            auth: {
              type: 'apikey',
              token: '',
              username: '',
              password: '',
              realm: '',
              apiKey: 'should-skip',
              apiKeyHeader: 'X-Api-Key',
              apiKeyIn: 'header',
              grantType: 'authorization_code',
              pkce: true,
              codeChallengeMethod: 'S256',
              authUrl: '',
              tokenUrl: '',
              deviceAuthUrl: '',
              clientId: '',
              clientSecret: '',
              scope: '',
              audience: '',
              redirectUri: '',
              accessToken: '',
              refreshToken: '',
              tokenType: 'Bearer',
              expiresAt: '',
            },
          },
        },
      ],
    };

    const report = analyzePackExportSecrets({
      selection: { categories: ['collections'], collectionIds: ['req-1'] },
      collections,
    });

    expect(report.total).toBe(1);
    expect(report.findings[0]?.label).toContain('Login');
  });
});

describe('stripPackSecrets', () => {
  it('clears secret values in the pack payload', () => {
    const cookies: CookiesFile = {
      schemaVersion: 1,
      cookies: [
        {
          id: 'c1',
          enabled: true,
          name: 'session',
          value: 'abc123',
          domain: 'example.com',
          path: '/',
          expires: '',
          secure: true,
          httpOnly: true,
        },
      ],
    };
    const payload = stripPackSecrets({
      'cookies.json': cookies,
      'environments.json': {
        schemaVersion: 1,
        activeId: null,
        items: [
          {
            id: 'e1',
            name: 'Local',
            variables: [
              {
                kind: 'variable',
                id: 'v1',
                key: 'token',
                value: 'keep-me-secret',
                description: '',
                enabled: true,
                secret: true,
              },
            ],
          },
        ],
      },
    });

    const nextCookies = payload['cookies.json'] as CookiesFile;
    const nextEnvs = payload['environments.json'] as EnvironmentsFile;
    expect(nextCookies.cookies[0]?.value).toBe('');
    expect(nextEnvs.items[0]?.variables[0]).toMatchObject({ key: 'token', value: '' });
  });
});
