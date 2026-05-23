import { ComponentFixture, TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { ConfigService } from '@app/core/config/config.service';
import { LoadTestService } from '@app/core/testing/load-test.service';
import { createDefaultSession, createDefaultSettings } from '@shared/config';
import { loadTestsFileSchema } from '@shared/testing';
import { TxIconService } from '@app/shared/icons/tx-icon.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';

import type { TxTreeNodeClickEvent } from '@app/shared/components/tx-tree/tx-tree.types';

import { toLoadTestTreeNodes } from './load-test-tree.adapter';
import { LoadTestSidebarPanelComponent } from './load-test-sidebar-panel.component';
import type { LoadTestTreeNodeMeta } from './load-test-tree.types';

const SAMPLE_FILE = loadTestsFileSchema.parse({
  schemaVersion: 1,
  items: [
    {
      id: 'fld-1',
      name: 'Smoke',
      updatedAt: '2026-01-01T00:00:00.000Z',
      children: [
        {
          id: 'a1',
          name: 'Health check',
          description: '',
          docs: '',
          profile: { durationSec: 60, virtualUsers: 5, rampUpSec: 0 },
          thresholds: {},
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    },
    {
      id: 'a2',
      name: 'Root load test',
      description: '',
      docs: '',
      profile: { durationSec: 60, virtualUsers: 10, rampUpSec: 0 },
      thresholds: {},
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
});

describe('LoadTestSidebarPanelComponent', () => {
  let fixture: ComponentFixture<LoadTestSidebarPanelComponent>;
  let openResource: ReturnType<typeof vi.fn>;
  let treeNodes: ReturnType<typeof toLoadTestTreeNodes>;
  const settingsState = signal(createDefaultSettings());

  beforeEach(async () => {
    settingsState.set(createDefaultSettings());
    openResource = vi.fn();
    treeNodes = toLoadTestTreeNodes(SAMPLE_FILE.items);

    await TestBed.configureTestingModule({
      imports: [LoadTestSidebarPanelComponent],
      providers: [
        {
          provide: LoadTestService,
          useValue: {
            nodes: signal(treeNodes),
            allTags: computed(() => []),
            addFolder: vi.fn(),
            addArtifact: vi.fn().mockReturnValue({ id: 'new-a' }),
            saveNodes: vi.fn(),
            renameNode: vi.fn(),
            deleteNode: vi.fn().mockReturnValue([]),
            duplicateArtifact: vi.fn(),
            tabResourceId: (id: string) => `lt:${id}`,
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
            closeTabsForResourceIds: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoadTestSidebarPanelComponent);
    fixture.detectChanges();
  });

  it('renders tx-tree rows for folders and artifacts', () => {
    const tree = fixture.nativeElement.querySelector('tx-tree');
    expect(tree).toBeTruthy();
  });

  it('opens a load test tab when an artifact is clicked', () => {
    const clickEvent: TxTreeNodeClickEvent<LoadTestTreeNodeMeta> = {
      nodeId: 'a2',
      node: treeNodes.find((node) => node.id === 'a2')!,
    };
    fixture.componentInstance['performNodeClick'](clickEvent);
    expect(openResource).toHaveBeenCalledWith({
      resourceId: 'lt:a2',
      kind: 'load-test',
    });
  });
});
