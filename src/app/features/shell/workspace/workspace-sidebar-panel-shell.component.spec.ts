import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { TxIconService } from '@app/shared/icons/tx-icon.service';

import { WorkspaceSidebarPanelShellComponent } from './workspace-sidebar-panel-shell.component';

describe('WorkspaceSidebarPanelShellComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkspaceSidebarPanelShellComponent],
      providers: [
        {
          provide: TxIconService,
          useValue: {
            loadIconInner: () => Promise.resolve('<circle cx="12" cy="12" r="3"/>'),
          },
        },
      ],
    }).compileComponents();
  });

  it('renders search and toolbar actions', () => {
    const fixture = TestBed.createComponent(WorkspaceSidebarPanelShellComponent);
    fixture.componentRef.setInput('searchPlaceholder', 'Search…');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('tx-input')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('tx-divider').length).toBe(2);
    expect(fixture.nativeElement.querySelectorAll('.workspace-panel-shell__icon-btn').length).toBe(3);
  });

  it('emits searchChange when the search field updates', () => {
    const fixture = TestBed.createComponent(WorkspaceSidebarPanelShellComponent);
    fixture.detectChanges();

    const emitted: string[] = [];
    fixture.componentInstance.searchChange.subscribe((value) => emitted.push(value));

    fixture.componentInstance['handleSearchChange']('auth');
    expect(emitted).toEqual(['auth']);
  });

  it('emits allFoldersExpandedChange when expand-all is toggled', () => {
    const fixture = TestBed.createComponent(WorkspaceSidebarPanelShellComponent);
    fixture.componentRef.setInput('allFoldersExpanded', true);
    fixture.detectChanges();

    const emitted: boolean[] = [];
    fixture.componentInstance.allFoldersExpandedChange.subscribe((value) => emitted.push(value));

    const toggle = fixture.nativeElement.querySelector(
      '.workspace-panel-shell__icon-btn',
    ) as HTMLButtonElement;
    toggle.click();

    expect(emitted).toEqual([false]);
  });
});
