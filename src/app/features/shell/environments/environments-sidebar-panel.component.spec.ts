import { ComponentFixture, TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { ConfigService } from '@app/core/config/config.service';
import { EnvironmentsService } from '@app/core/environments/environments.service';
import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';
import { TxIconService } from '@app/shared/icons/tx-icon.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { createDefaultSession } from '@shared/config';

import { EnvironmentsSidebarPanelComponent } from './environments-sidebar-panel.component';

describe('EnvironmentsSidebarPanelComponent', () => {
  let fixture: ComponentFixture<EnvironmentsSidebarPanelComponent>;
  let openResource: ReturnType<typeof vi.fn>;
  const environments = [
    { id: 'env-local', name: 'Local', order: 0, nodes: [] },
    {
      id: 'env-staging',
      name: 'Staging',
      order: 10,
      nodes: [{ id: 'v1', kind: 'variable' as const, key: 'BASE', value: 'https://example.com' }],
    },
  ];

  beforeEach(async () => {
    openResource = vi.fn();
    await TestBed.configureTestingModule({
      imports: [EnvironmentsSidebarPanelComponent],
      providers: [
        {
          provide: EnvironmentsService,
          useValue: {
            environments: signal(environments),
            hydrate: vi.fn().mockResolvedValue(undefined),
            createEnvironment: vi.fn().mockReturnValue('new-env'),
            cloneEnvironment: vi.fn().mockReturnValue('env-clone'),
            updateEnvironment: vi.fn().mockReturnValue(true),
            deleteNode: vi.fn().mockReturnValue(true),
          },
        },
        {
          provide: TxIconService,
          useValue: {
            loadIconInner: () => Promise.resolve('<path d="M6 6l12 12"/>'),
          },
        },
        {
          provide: WorkspaceEditorService,
          useValue: {
            openResource,
            activeTab: signal(null),
            groups: signal({}),
            closeTabsForResourceIds: vi.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            session: signal(createDefaultSession()),
            sessionRevision: () => 0,
            patchSession: vi.fn(),
          },
        },
        {
          provide: UiPreferencesService,
          useValue: { entranceStaggerEnabled: computed(() => false) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EnvironmentsSidebarPanelComponent);
    fixture.detectChanges();
  });

  it('lists environment profiles', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    const labels = [...fixture.nativeElement.querySelectorAll('.environments-sidebar-panel__row-label')].map(
      (el: Element) => el.textContent?.trim() ?? '',
    );

    expect(labels).toContain('Local');
    expect(labels).toContain('Staging');
  });

  it('opens an environment tab when a profile row is clicked', async () => {
    vi.useFakeTimers();
    const row = [...fixture.nativeElement.querySelectorAll('.environments-sidebar-panel__row')].find(
      (el: Element) => el.textContent?.includes('Local'),
    ) as HTMLElement | undefined;
    expect(row).toBeTruthy();
    row?.click();
    await vi.advanceTimersByTimeAsync(250);
    expect(openResource).toHaveBeenCalledWith({
      resourceId: 'env-local',
      kind: 'environment',
    });
    vi.useRealTimers();
  });

  it('clones an environment from the row context menu', () => {
    const row = [...fixture.nativeElement.querySelectorAll('.environments-sidebar-panel__row')].find(
      (el: Element) => el.textContent?.includes('Local'),
    ) as HTMLElement | undefined;
    row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
    fixture.detectChanges();

    fixture.componentInstance['handleContextMenuSelect']('clone');
    expect(TestBed.inject(EnvironmentsService).cloneEnvironment).toHaveBeenCalledWith('env-local');
    expect(openResource).toHaveBeenCalledWith({
      resourceId: 'env-clone',
      kind: 'environment',
    });
  });

  it('filters environments when search changes', () => {
    vi.useFakeTimers();
    fixture.componentInstance['handleSearch']('Staging');
    vi.advanceTimersByTime(100);
    fixture.detectChanges();
    vi.useRealTimers();

    const labels = [...fixture.nativeElement.querySelectorAll('.environments-sidebar-panel__row-label')].map(
      (el: Element) => el.textContent?.trim() ?? '',
    );

    expect(labels).toEqual(['Staging']);
  });

  it('sorts environments by name when sort menu selects name', () => {
    fixture.componentInstance['handleSortMenuSelect']('name');
    fixture.detectChanges();

    const labels = [...fixture.nativeElement.querySelectorAll('.environments-sidebar-panel__row-label')].map(
      (el: Element) => el.textContent?.trim() ?? '',
    );

    expect(labels).toEqual(['Local', 'Staging']);
  });

  it('filters to environments with variables', () => {
    fixture.componentInstance['handleFilterMenuSelect']('with-variables');
    fixture.detectChanges();

    const labels = [...fixture.nativeElement.querySelectorAll('.environments-sidebar-panel__row-label')].map(
      (el: Element) => el.textContent?.trim() ?? '',
    );

    expect(labels).toEqual(['Staging']);
  });
});
