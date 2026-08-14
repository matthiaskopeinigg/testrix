import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { createDefaultCollections } from '@shared/config';

import { CollectionsService } from './collections.service';
import { ErrorNotificationService } from '../errors/error-notification.service';
import { ElectronService } from '../electron/electron.service';

describe('CollectionsService', () => {
  it('hydrates from IPC and saves debounced writes', async () => {
    const setCollections = vi.fn().mockResolvedValue(undefined);
    const file = createDefaultCollections();

    TestBed.configureTestingModule({
      providers: [
        CollectionsService,
        {
          provide: ElectronService,
          useValue: {
            bridge: () => ({
              config: {
                getCollections: vi.fn().mockResolvedValue(file),
                setCollections,
              },
            }),
          },
        },
        {
          provide: ErrorNotificationService,
          useValue: { reportUnknown: vi.fn() },
        },
      ],
    });

    const service = TestBed.inject(CollectionsService);
    await service.hydrate();
    expect(service.nodes().length).toBe(file.nodes.length);

    service.createFolder(null, 'QA folder');
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(setCollections).toHaveBeenCalled();
  });

  it('persists folder settings on the folder node in collections.json', async () => {
    const setCollections = vi.fn().mockResolvedValue(undefined);
    const file = createDefaultCollections();

    TestBed.configureTestingModule({
      providers: [
        CollectionsService,
        {
          provide: ElectronService,
          useValue: {
            bridge: () => ({
              config: {
                getCollections: vi.fn().mockResolvedValue(file),
                setCollections,
              },
            }),
          },
        },
        {
          provide: ErrorNotificationService,
          useValue: { reportUnknown: vi.fn() },
        },
      ],
    });

    const service = TestBed.inject(CollectionsService);
    await service.hydrate();
    const folderId = service.createFolder(null, 'Persist me');
    expect(folderId).toBeTruthy();

    service.patchFolderSettings(folderId!, {
      variables: [{ id: 'v1', key: 'api', value: 'https://x.test', description: 'Root URL' }],
      auth: { type: 'bearer', token: 'tok' },
      scripts: { pre: '// pre', post: '' },
    });

    await new Promise((resolve) => setTimeout(resolve, 350));

    const saved = setCollections.mock.calls.at(-1)?.[0] as ReturnType<typeof createDefaultCollections>;
    const folder = saved.nodes.find((n) => n.id === folderId);
    expect(folder?.kind).toBe('folder');
    if (folder?.kind === 'folder') {
      expect(folder.settings.variables[0]?.description).toBe('Root URL');
      expect(folder.settings.auth).toEqual({ type: 'bearer', token: 'tok' });
      expect(folder.settings.scripts.pre).toBe('// pre');
    }
  });
});
