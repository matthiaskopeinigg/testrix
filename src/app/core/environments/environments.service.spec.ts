import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { createDefaultEnvironments } from '@shared/config';

import { ElectronService } from '../electron/electron.service';
import { ErrorNotificationService } from '../errors/error-notification.service';
import { EnvironmentsService } from './environments.service';

describe('EnvironmentsService', () => {
  it('hydrates from electron config and saves on environment create', async () => {
    const file = createDefaultEnvironments();
    const setEnvironments = vi.fn().mockResolvedValue(file);

    TestBed.configureTestingModule({
      providers: [
        EnvironmentsService,
        {
          provide: ElectronService,
          useValue: {
            bridge: () => ({
              config: {
                getEnvironments: vi.fn().mockResolvedValue(file),
                setEnvironments,
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

    const service = TestBed.inject(EnvironmentsService);
    await service.hydrate();
    expect(service.environments()).toEqual([]);

    service.createEnvironment('QA');
    await vi.waitFor(() => expect(setEnvironments).toHaveBeenCalled(), { timeout: 1000 });
  });
});
