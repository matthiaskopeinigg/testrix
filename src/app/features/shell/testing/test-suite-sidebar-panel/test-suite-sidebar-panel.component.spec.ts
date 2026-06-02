import { ComponentFixture, TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { ConfigService } from '@app/core/config/config.service';
import { TestSuiteService } from '@app/core/testing/test-suite.service';
import { createDefaultSession, createDefaultSettings } from '@shared/config';
import { createDefaultTestSuitesFile, testSuiteTabResourceId } from '@shared/testing';
import { TxIconService } from '@app/shared/icons/tx-icon.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';

import type { TxTreeNodeClickEvent } from '@app/shared/components/tx-tree/tx-tree.types';

import { toTestSuiteTreeNodes } from './test-suite-tree.adapter';
import { TestSuiteSidebarPanelComponent } from './test-suite-sidebar-panel.component';
import type { TestSuiteTreeNodeMeta } from './test-suite-tree.types';

const SAMPLE_ROOT = createDefaultTestSuitesFile().suites[0]!;
const SAMPLE_FILE = createDefaultTestSuitesFile();
SAMPLE_FILE.suites[0] = {
  ...SAMPLE_ROOT,
  flows: [
    {
      id: 'fld-1',
      name: 'Smoke folder',
      description: '',
      tags: [],
      children: [
        {
          id: 'flw-1',
          name: 'Smoke flow',
          description: '',
          tags: [],
          nodes: [],
          lastRunStatus: 'never' as const,
          lastRunAt: null,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
};

describe('TestSuiteSidebarPanelComponent', () => {
  let fixture: ComponentFixture<TestSuiteSidebarPanelComponent>;
  let openResource: ReturnType<typeof vi.fn>;
  let closeTabsForResourceIds: ReturnType<typeof vi.fn>;
  const treeNodes = toTestSuiteTreeNodes(SAMPLE_FILE.suites[0]!.flows);
  const settingsState = signal(createDefaultSettings());

  beforeEach(async () => {
    settingsState.set(createDefaultSettings());
    openResource = vi.fn();
    closeTabsForResourceIds = vi.fn();

    await TestBed.configureTestingModule({
      imports: [TestSuiteSidebarPanelComponent],
      providers: [
        {
          provide: TestSuiteService,
          useValue: {
            nodes: signal(treeNodes),
            flows: computed(() => SAMPLE_FILE.suites[0]!.flows),
            addFolder: vi.fn(),
            addFlow: vi.fn().mockReturnValue({ id: 'flw-new' }),
            allTags: computed(() => []),
            duplicateTreeItem: vi.fn(),
            saveNodes: vi.fn(),
            renameNode: vi.fn(),
            deleteTreeItem: vi.fn(),
            tabResourceId: testSuiteTabResourceId,
          },
        },
        {
          provide: ConfigService,
          useValue: {
            settings: settingsState,
            session: signal(createDefaultSession()),
            sessionRevision: signal(0),
            patchSession: vi.fn().mockResolvedValue(undefined),
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
            closeTabsForResourceIds,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TestSuiteSidebarPanelComponent);
    fixture.detectChanges();
  });

  it('renders tx-tree for flows', () => {
    expect(fixture.nativeElement.querySelector('tx-tree')).toBeTruthy();
  });

  it('expands the drop target folder after an inside drop', () => {
    const config = fixture.componentInstance['treeConfig']();
    expect(config.expansion.expandFolderOnDrop).toBe(true);
  });

  it('opens a folder tab and expands when a folder row is clicked', () => {
    const folderNode = treeNodes.find((n) => n.id === 'fld-1')!;
    fixture.componentInstance['handleNodeClick']({
      nodeId: 'fld-1',
      node: folderNode,
    });
    expect(openResource).toHaveBeenCalledWith({
      resourceId: testSuiteTabResourceId('folder', 'fld-1'),
      kind: 'test-suite',
    });
    expect(fixture.componentInstance['expandedIds']()).toContain('fld-1');
  });

  it('opens a flow tab when a flow row is clicked', () => {
    const flowNode = treeNodes[0]?.children?.find((n) => n.id === 'flw-1');
    expect(flowNode).toBeTruthy();
    fixture.componentInstance['handleNodeClick']({
      nodeId: 'flw-1',
      node: flowNode!,
    });
    expect(openResource).toHaveBeenCalledWith({
      resourceId: testSuiteTabResourceId('flow', 'flw-1'),
      kind: 'test-suite',
    });
  });

  it('closes folder and flow tabs when a folder is deleted', () => {
    fixture.componentInstance['deleteNodeId'].set('fld-1');
    fixture.componentInstance['handleDeleteConfirmed']();
    expect(closeTabsForResourceIds).toHaveBeenCalledWith([
      testSuiteTabResourceId('folder', 'fld-1'),
      testSuiteTabResourceId('flow', 'flw-1'),
    ]);
  });
});
