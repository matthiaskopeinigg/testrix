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

describe('DatabaseCatalogService', () => {
  it('loads schema tables after an in-flight connection refresh finishes', async () => {
    let releaseSchemas: (() => void) | undefined;
    const schemasGate = new Promise<void>((resolve) => {
      releaseSchemas = resolve;
    });
    const introspect = vi.fn(async (request: { readonly level: string }) => {
      if (request.level === 'schemas') {
        await schemasGate;
        return { level: 'schemas', schemas: [{ name: 'public', system: false }] };
      }
      return {
        level: 'tables',
        tables: [{ schema: 'public', name: 'users', kind: 'table' }],
      };
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
    releaseSchemas?.();
    await Promise.all([open, load]);

    expect(catalog.snapshot('c1')?.tablesBySchema['public']).toEqual([
      { schema: 'public', name: 'users', kind: 'table' },
    ]);
  });
});
