import type { CollectionTree } from './collection-tree';
import type { ImportFormat } from './import-detect';
import type { ServiceTreeNode } from './service-tree';
import type { WorkspacePackSelection } from './workspace-pack';

export type WorkspaceImportMode = 'merge' | 'replace' | 'new';

export interface WorkspaceExportPackResult {
  readonly canceled: boolean;
  readonly path?: string;
}

export interface WorkspaceImportInspectResult {
  readonly format: ImportFormat;
  readonly path: string;
  readonly warnings: string[];
  readonly sourceName?: string;
  /** For native packs: payload trees for selection UI */
  readonly selectionPreview?: {
    readonly categories: string[];
    readonly collections?: CollectionTree;
    readonly flows?: ServiceTreeNode<unknown>[];
    readonly mocks?: ServiceTreeNode<unknown>[];
    /** OpenAPI/Postman generated trees */
    readonly generatedCollections?: CollectionTree;
  };
  readonly checksumOk?: boolean;
}

export interface WorkspaceImportApplyRequest {
  readonly path: string;
  readonly mode: WorkspaceImportMode;
  readonly selection: WorkspacePackSelection;
  readonly workspaceName?: string;
}
