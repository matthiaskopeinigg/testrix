import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { TxIconService } from '@app/shared/icons/tx-icon.service';

import { DevelopmentSidebarPanelComponent } from './development-sidebar-panel.component';

describe('DevelopmentSidebarPanelComponent', () => {
  let fixture: ComponentFixture<DevelopmentSidebarPanelComponent>;
  let openResource: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    openResource = vi.fn();
    await TestBed.configureTestingModule({
      imports: [DevelopmentSidebarPanelComponent],
      providers: [
        {
          provide: WorkspaceEditorService,
          useValue: {
            openResource,
            activeTab: signal(null),
          },
        },
        {
          provide: UiPreferencesService,
          useValue: { entranceStaggerEnabled: () => false },
        },
        {
          provide: TxIconService,
          useValue: {
            loadIconInner: () => Promise.resolve('<path d="M6 6l12 12"/>'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DevelopmentSidebarPanelComponent);
    fixture.detectChanges();
  });

  it('opens a dev-tool tab when a tool row is selected', () => {
    fixture.componentInstance['handleToolSelect']('base64');
    expect(openResource).toHaveBeenCalledWith({ resourceId: 'base64', kind: 'dev-tool' });
  });

  it('filters tools by search query', () => {
    fixture.componentInstance['handleSearch']('jwt');
    fixture.detectChanges();
    const filtered = fixture.componentInstance['filteredTools']();
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe('jwt');
  });
});
