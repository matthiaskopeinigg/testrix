import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import {
  createDefaultCollectionFolderSettings,
  createDefaultSession,
  createDefaultSettings,
} from '@shared/config';

import { CollectionsService } from '@app/core/collections/collections.service';
import { ConfigService } from '@app/core/config/config.service';
import { TxIconService } from '@app/shared/icons/tx-icon.service';

import { COLLECTION_TREE_MOCK } from '@app/features/shell/collections/collection-tree.mock';

import { CollectionFolderWorkspaceTabComponent } from './collection-folder-workspace-tab.component';

describe('CollectionFolderWorkspaceTabComponent', () => {
  let fixture: ComponentFixture<CollectionFolderWorkspaceTabComponent>;
  let patchFolderSettings: ReturnType<typeof vi.fn>;
  let patchSession: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    patchFolderSettings = vi.fn().mockReturnValue(true);
    patchSession = vi.fn().mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [CollectionFolderWorkspaceTabComponent],
      providers: [
        {
          provide: CollectionsService,
          useValue: {
            nodes: () => COLLECTION_TREE_MOCK,
            patchFolderSettings,
          },
        },
        {
          provide: ConfigService,
          useValue: {
            session: () => createDefaultSession(),
            settings: () => createDefaultSettings(),
            sessionRevision: () => 0,
            patchSession,
          },
        },
        {
          provide: TxIconService,
          useValue: { loadIconInner: () => Promise.resolve('<path d="M0 0"/>') },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CollectionFolderWorkspaceTabComponent);
    fixture.componentRef.setInput('resourceId', 'folder-auth');
    fixture.detectChanges();
  });

  it('persists active section to session', async () => {
    vi.useFakeTimers();
    fixture.componentInstance['handleSectionSelect']('script');
    vi.advanceTimersByTime(200);
    await Promise.resolve();
    expect(patchSession).toHaveBeenCalledWith({
      workspace: {
        collections: {
          folderTabsById: {
            'folder-auth': {
              activeSection: 'script',
              activeScriptPane: 'pre',
            },
          },
        },
      },
    });
    vi.useRealTimers();
  });

  it('renders sidebar section nav by default', () => {
    expect(fixture.nativeElement.querySelector('.folder-tab__nav')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('#folder-section')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.folder-tab__sections-wrap')).toBeFalsy();
  });

  it('shows overview by default with description field', () => {
    const textarea = fixture.nativeElement.querySelector('#folder-description');
    expect(textarea).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Authorization');
    expect(fixture.nativeElement.textContent).toContain('Folder settings');
  });

  it('shows bearer fields when auth section is selected', async () => {
    const nodes = COLLECTION_TREE_MOCK.map((node) => {
      if (node.id !== 'folder-auth') {
        return node;
      }
      return {
        ...node,
        data: {
          kind: 'folder' as const,
          settings: {
            ...createDefaultCollectionFolderSettings(),
            auth: { type: 'bearer' as const, token: 'secret' },
          },
        },
      };
    });

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [CollectionFolderWorkspaceTabComponent],
      providers: [
        {
          provide: CollectionsService,
          useValue: { nodes: () => nodes, patchFolderSettings },
        },
        {
          provide: ConfigService,
          useValue: {
            session: () => createDefaultSession(),
            settings: () => createDefaultSettings(),
            sessionRevision: () => 0,
            patchSession,
          },
        },
        {
          provide: TxIconService,
          useValue: { loadIconInner: () => Promise.resolve('<path d="M0 0"/>') },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CollectionFolderWorkspaceTabComponent);
    fixture.componentRef.setInput('resourceId', 'folder-auth');
    fixture.detectChanges();

    fixture.componentInstance['handleSectionSelect']('auth');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Authorization');
    expect(fixture.nativeElement.querySelector('#folder-auth-bearer-token')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Token');
  });
});
