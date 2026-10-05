import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_USER_SETTINGS, emptyAndroidToolchainStatus, localCollabStatus } from '@testrix/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmDialogService } from '../../core/confirm-dialog.service';
import { DesktopApiService } from '../../core/desktop-api.service';
import { ShellStateService } from '../../core/shell-state.service';
import { CollabStore } from '../collab/collab.store';
import { CookieAuthDialogService } from '../cookie-auth/cookie-auth-dialog.service';
import { DatabaseStore } from '../database/database.store';
import { HistoryStore } from '../history/history.store';
import { ServicesStore } from '../services/services.store';
import { UpdateStore } from '../updates/update.store';
import { ExportWorkspaceDialogService } from '../workspace-transfer/export-workspace-dialog.service';
import { ImportWorkspaceDialogService } from '../workspace-transfer/import-workspace-dialog.service';
import { WorkbenchStore } from '../workbench/workbench.store';
import { SettingsOverlayComponent } from './settings-overlay.component';

describe('SettingsOverlayComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DesktopApiService,
          useValue: {
            settings: signal({ ...DEFAULT_USER_SETTINGS, settingsWizardCompleted: false }),
            configPaths: () => ({ files: [] }),
            patchSettings: vi.fn(),
            api: {
              services: {
                onDeviceEvent: () => () => undefined,
                device: { refresh: async () => emptyAndroidToolchainStatus() },
              },
            },
          },
        },
        {
          provide: ShellStateService,
          useValue: {
            settingsOpen: signal(true),
            settingsCategory: signal(null),
            settingsHighlight: signal(null),
            closeOverlays: vi.fn(),
            openRail: vi.fn(),
          },
        },
        { provide: UpdateStore, useValue: { status: signal({ state: 'idle' }) } },
        { provide: DatabaseStore, useValue: { connections: signal([]) } },
        { provide: HistoryStore, useValue: { entries: signal([]) } },
        { provide: WorkbenchStore, useValue: { tabCount: signal(0) } },
        { provide: ServicesStore, useValue: { drillIn: vi.fn() } },
        { provide: CookieAuthDialogService, useValue: { open: vi.fn() } },
        { provide: ExportWorkspaceDialogService, useValue: { settingsFlashTick: signal(0), open: vi.fn() } },
        { provide: ImportWorkspaceDialogService, useValue: { open: vi.fn() } },
        {
          provide: CollabStore,
          useValue: {
            status: signal(localCollabStatus()),
            repos: signal([]),
          },
        },
        { provide: ConfirmDialogService, useValue: { ask: vi.fn() } },
      ],
    });
  });

  it('opens the category list on Look & feel', () => {
    const fixture = TestBed.createComponent(SettingsOverlayComponent);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Settings');
    expect(text).toContain('Look & feel');
    expect(fixture.nativeElement.querySelector('#settings-search')).not.toBeNull();
  });

  it('does not reset the wizard when settings are saved after Show all settings', () => {
    const fixture = TestBed.createComponent(SettingsOverlayComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    expect(cmp.wizardMode()).toBe('abbreviated');
    cmp.showFullWizard();
    fixture.detectChanges();
    expect(cmp.wizardMode()).toBe('full');
    TestBed.inject(DesktopApiService).settings.update((current) => ({ ...current }));
    fixture.detectChanges();
    expect(cmp.wizardMode()).toBe('full');
  });
});
