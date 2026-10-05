import { OverlayModule } from '@angular/cdk/overlay';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmDialogService } from '../../core/confirm-dialog.service';
import { PlantumlStore } from './plantuml/plantuml.store';
import { ToolsDndService } from './tools-dnd.service';
import { ToolsSidebarComponent } from './tools-sidebar.component';
import { ToolsStore } from './tools.store';

describe('ToolsSidebarComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [OverlayModule],
      providers: [
        {
          provide: ToolsStore,
          useValue: {
            hasItems: signal(false),
            drillId: signal(null),
            paneSlideDir: signal(null),
            items: signal([]),
            back: vi.fn(),
          },
        },
        { provide: PlantumlStore, useValue: { items: signal([]), tree: signal([]) } },
        {
          provide: ToolsDndService,
          useValue: {
            registerSurface: vi.fn(),
            isIndicatorVisible: signal(false),
            indicatorLeft: signal(0),
            indicatorY: signal(0),
            announcement: signal(''),
          },
        },
        { provide: ConfirmDialogService, useValue: { ask: vi.fn() } },
      ],
    });
  });

  it('shows the empty tools sidebar', () => {
    const fixture = TestBed.createComponent(ToolsSidebarComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No tools');
  });
});
