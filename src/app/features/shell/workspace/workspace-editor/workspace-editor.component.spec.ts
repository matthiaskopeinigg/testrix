import { Component, computed, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceEditorState, WorkspaceTab } from '@shared/config';
import { createDefaultWorkspaceEditor } from '@shared/config';

import { WorkspaceEditorMotionService } from '@app/core/workspace/workspace-editor-motion.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { TxIconService } from '@app/shared/icons/tx-icon.service';

import { WorkspaceEditorComponent } from './workspace-editor.component';

@Component({
  selector: 'app-stub-workspace-tab',
  standalone: true,
  template: '<p class="stub-workspace-tab">stub</p>',
})
class StubWorkspaceTabComponent {
  readonly resourceId = input<string>('');
  readonly active = input(false);
  readonly cached = input(false);
}

function createTab(id: string, resourceId: string): WorkspaceTab {
  return {
    id,
    resourceId,
    kind: 'request',
    pinned: false,
    label: resourceId,
  };
}

describe('WorkspaceEditorComponent mount cache', () => {
  let fixture: ComponentFixture<WorkspaceEditorComponent>;
  let editorState: ReturnType<typeof signal<WorkspaceEditorState>>;
  let activateTab: ReturnType<typeof vi.fn>;
  let closeTab: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const base = createDefaultWorkspaceEditor();
    editorState = signal({
      ...base,
      groups: {
        main: {
          tabs: [createTab('tab-a', 'req-a'), createTab('tab-b', 'req-b')],
          activeTabId: 'tab-a',
        },
      },
    });

    activateTab = vi.fn((groupId: string, tabId: string) => {
      editorState.update((state) => ({
        ...state,
        groups: {
          ...state.groups,
          [groupId]: {
            ...state.groups[groupId]!,
            activeTabId: tabId,
          },
        },
      }));
    });

    closeTab = vi.fn((groupId: string, tabId: string) => {
      editorState.update((state) => {
        const group = state.groups[groupId];
        if (!group) {
          return state;
        }
        const tabs = group.tabs.filter((tab) => tab.id !== tabId);
        const activeTabId =
          group.activeTabId === tabId ? (tabs[0]?.id ?? null) : group.activeTabId;
        return {
          ...state,
          groups: {
            ...state.groups,
            [groupId]: { tabs, activeTabId },
          },
        };
      });
    });

    await TestBed.configureTestingModule({
      imports: [WorkspaceEditorComponent],
      providers: [
        {
          provide: WorkspaceEditorService,
          useValue: {
            groups: computed(() => editorState().groups),
            editor: editorState.asReadonly(),
            layout: computed(() => editorState().layout),
            tabsForGroup: (groupId: string) => editorState().groups[groupId]?.tabs ?? [],
            activateTab,
            closeTab,
            focusGroup: vi.fn(),
            hasMultiplePanes: () => false,
            motion: {
              layoutTransition: signal(null).asReadonly(),
              isPaneEntering: () => false,
            },
          },
        },
        {
          provide: WorkspaceEditorMotionService,
          useValue: {
            layoutTransition: signal(null),
            isEnabled: () => false,
            isPaneEntering: () => false,
          },
        },
        {
          provide: TxIconService,
          useValue: { loadIconInner: () => Promise.resolve('<path d="M0 0"/>') },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkspaceEditorComponent);
    const cmp = fixture.componentInstance as WorkspaceEditorComponent;
    cmp['tabComponentsByKind'].set({ request: StubWorkspaceTabComponent });
    fixture.detectChanges();
  });

  afterEach(async () => {
    await fixture.whenStable();
    fixture.destroy();
  });

  it('pre-mounts the active tab from editor state', () => {
    const cmp = fixture.componentInstance as WorkspaceEditorComponent;
    expect(cmp['isTabMounted']('main', 'tab-a')).toBe(true);
  });

  it('mounts a tab on activate and marks it active', () => {
    const cmp = fixture.componentInstance as WorkspaceEditorComponent;
    cmp['handleTabActivate']('main', 'tab-b');
    fixture.detectChanges();

    expect(activateTab).toHaveBeenCalledWith('main', 'tab-b');
    expect(cmp['isTabMounted']('main', 'tab-b')).toBe(true);
    expect(cmp['isTabActive']('main', 'tab-b')).toBe(true);
    expect(cmp['tabInputs'](createTab('tab-b', 'req-b'), 'main')['active']).toBe(true);
  });

  it('evicts mount cache when a tab is closed', () => {
    const cmp = fixture.componentInstance as WorkspaceEditorComponent;
    cmp['handleTabActivate']('main', 'tab-b');
    fixture.detectChanges();

    cmp['handleTabClose']('main', 'tab-a');
    fixture.detectChanges();

    expect(closeTab).toHaveBeenCalledWith('main', 'tab-a');
    expect(cmp['isTabMounted']('main', 'tab-a')).toBe(false);
    expect(cmp['isTabMounted']('main', 'tab-b')).toBe(true);
  });

  it('passes active=true only for the active tab inputs', () => {
    editorState.set({
      ...editorState(),
      groups: {
        main: {
          tabs: [createTab('tab-a', 'req-a'), createTab('tab-b', 'req-b')],
          activeTabId: 'tab-b',
        },
      },
    });
    fixture.detectChanges();

    const cmp = fixture.componentInstance as WorkspaceEditorComponent;
    cmp['handleTabActivate']('main', 'tab-b');
    fixture.detectChanges();

    expect(cmp['isTabActive']('main', 'tab-a')).toBe(false);
    expect(cmp['isTabActive']('main', 'tab-b')).toBe(true);
    expect(cmp['tabInputs'](createTab('tab-a', 'req-a'), 'main')['active']).toBe(false);
    expect(cmp['tabInputs'](createTab('tab-b', 'req-b'), 'main')['active']).toBe(true);
  });

  it('does not loop when the mount effect reconciles an active tab', () => {
    const cmp = fixture.componentInstance as WorkspaceEditorComponent;
    const warmTabOrder = cmp['warmTabOrder'];

    for (let i = 0; i < 8; i += 1) {
      fixture.detectChanges();
    }

    expect(warmTabOrder()).toEqual([]);
    expect(cmp['isTabMounted']('main', 'tab-a')).toBe(true);
  });
});
