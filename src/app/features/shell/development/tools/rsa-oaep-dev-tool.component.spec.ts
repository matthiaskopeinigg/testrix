import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { DevelopmentSessionService } from '@app/core/development/development-session.service';
import { ElectronService } from '@app/core/electron/electron.service';
import { TxIconService } from '@app/shared/icons/tx-icon.service';
import { createDefaultWorkspaceDevelopment } from '@shared/config';

import { RsaOaepDevToolComponent } from './rsa-oaep-dev-tool.component';

describe('RsaOaepDevToolComponent', () => {
  it('renders encrypt mode without persisting the key password', async () => {
    await TestBed.configureTestingModule({
      imports: [RsaOaepDevToolComponent],
      providers: [
        {
          provide: DevelopmentSessionService,
          useValue: {
            load: vi.fn(),
            getToolState: () => createDefaultWorkspaceDevelopment().tools['rsa-oaep'],
            patchToolState: vi.fn(),
          },
        },
        {
          provide: ElectronService,
          useValue: { bridge: () => undefined },
        },
        {
          provide: TxIconService,
          useValue: { loadIconInner: () => Promise.resolve('<path d="M0 0"/>') },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(RsaOaepDevToolComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance['state']().mode).toBe('encode');
    fixture.componentInstance['keyPassword'].set('secret');
    expect(fixture.componentInstance['state']().mode).toBe('encode');
    fixture.destroy();
  });
});
