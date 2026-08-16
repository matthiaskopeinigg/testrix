import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import type { DatabaseConnection } from '@shared/config';

import { ElectronService } from '../electron/electron.service';
import { DatabaseCatalogService } from './database-catalog.service';

const CONNECTION: DatabaseConnection = {
  id: 'c1',
  kind: 'connection',
  name: 'Local',
  type: 'postgresql',
  host: 'localhost',
  port: 5432,
  database: 'testrix',
  connectOnBoot: false,
};

const ORACLE: DatabaseConnection = {
  id: 'ora1',
  kind: 'connection',
  name: 'Oracle',
  type: 'oracle',
  host: 'db',
  port: 1521,
  user: 'hr',
  database: 'ORCL',
  connectOnBoot: false,
};

describe('DatabaseCatalogService', () => {
  it('opens without querying the full schema directory', async () => {
    const introspect = vi.fn(async (request: { readonly level: string }) => {
      if (request.level === 'schemas') {
        return {
          level: 'schemas',
          schemas: Array.from({ length: 200 }, (_, index) => ({
            name: `USER_${index}`,
            system: false,
          })),
        };
      }
      return { level: 'tables', tables: [] };
    });

    TestBed.configureTestingModule({
      providers: [
        DatabaseCatalogService,
        {
          provide: ElectronService,
          useValue: { bridge: () => ({ database: { introspect } }) },
        },
      ],
    });

    const catalog = TestBed.inject(DatabaseCatalogService);
    await catalog.openConnection(ORACLE);

    expect(introspect).not.toHaveBeenCalled();
    expect(catalog.snapshot('ora1')?.schemaDirectory).toBe('seed');
    expect(catalog.snapshot('ora1')?.schemas).toEqual([]);
  });

  it('loads the full schema directory only for the Schemas picker', async () => {
    const introspect = vi.fn(async (request: { readonly level: string }) => {
      if (request.level === 'schemas') {
        return {
          level: 'schemas',
          schemas: [
            { name: 'HR', system: false },
            { name: 'SCOTT', system: false },
          ],
        };
      }
      return { level: 'tables', tables: [] };
    });

    TestBed.configureTestingModule({
      providers: [
        DatabaseCatalogService,
        {
          provide: ElectronService,
          useValue: { bridge: () => ({ database: { introspect } }) },
        },
      ],
    });

    const catalog = TestBed.inject(DatabaseCatalogService);
    await catalog.openConnection(ORACLE);
    await catalog.ensureFullSchemaDirectory(ORACLE);

    expect(introspect).toHaveBeenCalledTimes(1);
    expect(catalog.snapshot('ora1')?.schemaDirectory).toBe('full');
    expect(catalog.snapshot('ora1')?.schemas).toHaveLength(2);
  });

  it('loads schema tables after an in-flight connection refresh finishes', async () => {
    let releaseOpen: (() => void) | undefined;
    const openGate = new Promise<void>((resolve) => {
      releaseOpen = resolve;
    });
    const introspect = vi.fn(async (request: { readonly level: string }) => {
      if (request.level === 'tables') {
        await openGate;
        return {
          level: 'tables',
          tables: [{ schema: 'public', name: 'users', kind: 'table' }],
        };
      }
      return { level: 'schemas', schemas: [{ name: 'public', system: false }] };
    });

    TestBed.configureTestingModule({
      providers: [
        DatabaseCatalogService,
        {
          provide: ElectronService,
          useValue: { bridge: () => ({ database: { introspect } }) },
        },
      ],
    });

    const catalog = TestBed.inject(DatabaseCatalogService);
    const open = catalog.openConnection(CONNECTION);
    const load = catalog.loadSchema(CONNECTION, 'public');
    releaseOpen?.();
    await Promise.all([open, load]);

    expect(catalog.snapshot('c1')?.tablesBySchema['public']).toEqual([
      { schema: 'public', name: 'users', kind: 'table' },
    ]);
  });
});
