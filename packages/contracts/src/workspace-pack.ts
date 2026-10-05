import { z } from 'zod';

import { CONFIG_WORKSPACE_FILES, type ConfigWorkspaceFileName } from './config-files';
import type { CollectionNode, CollectionTree } from './collection-tree';
import {
  isDatabaseConnectionFolder,
  isSavedQueryFolder,
  type DatabaseConnectionTreeItem,
  type SavedQueryTreeItem,
} from './database';
import type { Environment, EnvironmentsFile } from './environment';
import { newEntityId } from './entity-id';
import type { FlowGraphTemplate } from './flow-templates-file';
import { newServiceNodeId, type ServiceTreeNode } from './service-tree';

export const WORKSPACE_PACK_SCHEMA_VERSION = 1;
export const WORKSPACE_PACK_EXTENSION = '.testrix';

export const WORKSPACE_PACK_CATEGORY_KEYS = [
  'collections',
  'flows',
  'mocks',
  'environments',
  'database',
  'queries',
  'history',
  'cookies',
  'load',
  'listeners',
  'intercept',
  'regressions',
  'emulator',
  'flow-templates',
  'plantuml',
] as const;

export type PackCategory = (typeof WORKSPACE_PACK_CATEGORY_KEYS)[number];

/** Categories offered in the Export workspace dialog (local-only / redundant data omitted). */
export const WORKSPACE_PACK_EXPORT_CATEGORY_KEYS = [
  'collections',
  'flows',
  'mocks',
  'environments',
  'database',
  'queries',
  'load',
  'intercept',
  'regressions',
  'flow-templates',
] as const satisfies readonly PackCategory[];

export type PackExportCategory = (typeof WORKSPACE_PACK_EXPORT_CATEGORY_KEYS)[number];

/** Maps export/import category keys to on-disk workspace filenames. */
export const PACK_CATEGORY_FILES: Record<PackCategory, ConfigWorkspaceFileName> = {
  collections: 'collections.json',
  flows: 'flows.json',
  mocks: 'mocks.json',
  environments: 'environments.json',
  database: 'database.json',
  queries: 'queries.json',
  history: 'history.json',
  cookies: 'cookies.json',
  load: 'load.json',
  listeners: 'listeners.json',
  intercept: 'intercept.json',
  regressions: 'regressions.json',
  emulator: 'emulator.json',
  'flow-templates': 'flow-templates.json',
  plantuml: 'plantuml.json',
};

export const PACK_DEEP_TREE_CATEGORIES = new Set<PackCategory>(['collections', 'flows', 'mocks']);

/** Export categories that support per-item selection in the export dialog. */
export const PACK_EXPORT_TREE_CATEGORIES = new Set<PackExportCategory>([
  'collections',
  'flows',
  'mocks',
  'environments',
  'database',
  'queries',
  'load',
  'intercept',
  'regressions',
  'flow-templates',
]);

const PACK_CATEGORY_SET = new Set<string>(WORKSPACE_PACK_CATEGORY_KEYS);

const EXCLUDED_PACK_FILES = new Set(['settings.json', 'session.json']);

export const workspacePackSelectionSchema = z.object({
  categories: z.array(z.string()),
  collectionIds: z.array(z.string()).optional(),
  flowIds: z.array(z.string()).optional(),
  mockIds: z.array(z.string()).optional(),
  environmentIds: z.array(z.string()).optional(),
  databaseIds: z.array(z.string()).optional(),
  queryIds: z.array(z.string()).optional(),
  loadIds: z.array(z.string()).optional(),
  interceptIds: z.array(z.string()).optional(),
  regressionIds: z.array(z.string()).optional(),
  flowTemplateIds: z.array(z.string()).optional(),
  /** When true, clear secret values in the pack payload before writing the zip. */
  omitSecrets: z.boolean().optional(),
});

export type WorkspacePackSelection = z.infer<typeof workspacePackSelectionSchema>;

export const workspacePackManifestSchema = z.object({
  schemaVersion: z.literal(WORKSPACE_PACK_SCHEMA_VERSION),
  exportedAt: z.string().min(1),
  appVersion: z.string().min(1),
  checksum: z.string().min(1),
  selection: workspacePackSelectionSchema,
  sourceWorkspaceName: z.string().optional(),
});

export type WorkspacePackManifest = z.infer<typeof workspacePackManifestSchema>;

/** Pack body: workspace filename → parsed JSON value (no zip layer). */
export type WorkspacePackPayload = Record<string, unknown>;

export type SelectionCheckState = 'checked' | 'unchecked' | 'indeterminate';

/**
 * SHA-256 hex digest via Web Crypto.
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', copy);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Canonical byte sequence for pack checksums: sorted paths joined with NUL and LF.
 */
export function buildChecksumMaterial(entries: Record<string, string>): Uint8Array {
  const keys = Object.keys(entries).sort((left, right) => left.localeCompare(right));
  let material = '';
  for (const key of keys)
    material += `${key}\0${entries[key]}\n`;
  return new TextEncoder().encode(material);
}

/**
 * Computes the manifest checksum from serialized file entries.
 */
export async function computePackChecksum(entries: Record<string, string>): Promise<string> {
  return sha256Hex(buildChecksumMaterial(entries));
}

/**
 * Allocates a new collection node id for the given kind.
 */
export function newCollectionNodeId(_kind: CollectionNode['kind']): string {
  return newEntityId();
}

/**
 * Replaces ids on a single collection node (recursive for folders).
 */
export function remintCollectionNode(node: CollectionNode): CollectionNode {
  if (node.kind === 'folder') {
    return {
      ...node,
      id: newCollectionNodeId('folder'),
      children: node.children.map((child) => remintCollectionNode(child)),
    };
  }
  if (node.kind === 'http') {
    return { ...node, id: newCollectionNodeId('http') };
  }
  return { ...node, id: newCollectionNodeId('websocket') };
}

/**
 * Replaces ids on every node in a collection tree.
 */
export function remintCollectionTree(tree: CollectionTree): CollectionTree {
  return tree.map((node) => remintCollectionNode(node));
}

function nodeOrDescendantSelected(node: CollectionNode, selectedIds: ReadonlySet<string>): boolean {
  if (selectedIds.has(node.id))
    return true;
  if (node.kind !== 'folder')
    return false;
  return node.children.some((child) => nodeOrDescendantSelected(child, selectedIds));
}

/**
 * Keeps nodes whose id is selected or that contain a selected descendant; prunes folder children.
 * When a folder id itself is selected, the entire subtree is kept.
 */
export function pruneCollectionTree(tree: CollectionTree, selectedIds: ReadonlySet<string>): CollectionTree {
  const out: CollectionTree = [];
  for (const node of tree) {
    const pruned = pruneCollectionNode(node, selectedIds);
    if (pruned)
      out.push(pruned);
  }
  return out;
}

function pruneCollectionNode(node: CollectionNode, selectedIds: ReadonlySet<string>): CollectionNode | null {
  if (node.kind !== 'folder') {
    return selectedIds.has(node.id) ? node : null;
  }
  if (selectedIds.has(node.id))
    return node;
  if (!nodeOrDescendantSelected(node, selectedIds))
    return null;
  return {
    ...node,
    children: pruneCollectionTree(node.children, selectedIds),
  };
}

/**
 * Generic service-tree prune (flows, mocks, etc.).
 */
export function pruneServiceTree<T>(
  tree: readonly ServiceTreeNode<T>[],
  selectedIds: ReadonlySet<string>,
): ServiceTreeNode<T>[] {
  const out: ServiceTreeNode<T>[] = [];
  for (const node of tree) {
    const pruned = pruneServiceNode(node, selectedIds);
    if (pruned)
      out.push(pruned);
  }
  return out;
}

function serviceNodeOrDescendantSelected<T>(
  node: ServiceTreeNode<T>,
  selectedIds: ReadonlySet<string>,
): boolean {
  if (selectedIds.has(node.id))
    return true;
  if (node.kind !== 'folder')
    return false;
  return node.children.some((child) => serviceNodeOrDescendantSelected(child, selectedIds));
}

function pruneServiceNode<T>(
  node: ServiceTreeNode<T>,
  selectedIds: ReadonlySet<string>,
): ServiceTreeNode<T> | null {
  if (node.kind !== 'folder') {
    return selectedIds.has(node.id) ? node : null;
  }
  if (selectedIds.has(node.id))
    return node;
  if (!serviceNodeOrDescendantSelected(node, selectedIds))
    return null;
  return {
    ...node,
    children: pruneServiceTree(node.children, selectedIds),
  };
}

function isPackCategory(value: string): value is PackCategory {
  return PACK_CATEGORY_SET.has(value);
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

type PackSelectionIdField =
  | 'collectionIds'
  | 'flowIds'
  | 'mockIds'
  | 'environmentIds'
  | 'databaseIds'
  | 'queryIds'
  | 'loadIds'
  | 'interceptIds'
  | 'regressionIds'
  | 'flowTemplateIds';

function selectionIdSet(
  selection: WorkspacePackSelection,
  field: PackSelectionIdField,
): ReadonlySet<string> | null {
  const value = selection[field];
  // Undefined or empty means "entire category" — empty arrays used to wipe the pack.
  if (value === undefined || value.length === 0)
    return null;
  return new Set(value);
}

/**
 * All environment ids in an environments file.
 */
export function collectEnvironmentIds(items: readonly Environment[]): string[] {
  return items.map((item) => item.id);
}

/**
 * All custom flow template ids (excludes built-in catalog entries not in file).
 */
export function collectFlowTemplateIds(templates: readonly FlowGraphTemplate[]): string[] {
  return templates.map((item) => item.id);
}

/**
 * Keeps environments whose id is selected; fixes activeId and orderIds.
 */
export function pruneEnvironmentsFile(
  file: EnvironmentsFile,
  selectedIds: ReadonlySet<string>,
): EnvironmentsFile {
  const items = file.items.filter((item) => selectedIds.has(item.id));
  const itemIds = new Set(items.map((item) => item.id));
  const orderIds = file.orderIds.filter((id) => itemIds.has(id));
  for (const item of items) {
    if (!orderIds.includes(item.id))
      orderIds.push(item.id);
  }
  const activeId =
    file.activeId && itemIds.has(file.activeId) ? file.activeId : (items[0]?.id ?? null);
  return { ...file, items, orderIds, activeId };
}

interface FolderTreeNode {
  readonly id: string;
  readonly kind: string;
  readonly children?: readonly FolderTreeNode[];
}

function folderNodeOrDescendantSelected(
  node: FolderTreeNode,
  selectedIds: ReadonlySet<string>,
  isFolder: (node: FolderTreeNode) => boolean,
): boolean {
  if (selectedIds.has(node.id))
    return true;
  if (!isFolder(node))
    return false;
  return (node.children ?? []).some((child) =>
    folderNodeOrDescendantSelected(child, selectedIds, isFolder),
  );
}

function pruneFolderTree<T extends FolderTreeNode>(
  tree: readonly T[],
  selectedIds: ReadonlySet<string>,
  isFolder: (node: T) => boolean,
): T[] {
  const out: T[] = [];
  for (const node of tree) {
    const pruned = pruneFolderNode(node, selectedIds, isFolder);
    if (pruned)
      out.push(pruned);
  }
  return out;
}

function pruneFolderNode<T extends FolderTreeNode>(
  node: T,
  selectedIds: ReadonlySet<string>,
  isFolder: (node: T) => boolean,
): T | null {
  if (!isFolder(node)) {
    return selectedIds.has(node.id) ? node : null;
  }
  if (selectedIds.has(node.id))
    return node;
  if (!folderNodeOrDescendantSelected(node, selectedIds, isFolder as (node: FolderTreeNode) => boolean))
    return null;
  return {
    ...node,
    children: pruneFolderTree((node.children ?? []) as readonly T[], selectedIds, isFolder),
  } as T;
}

/**
 * Database connection tree prune (folder | connection nodes).
 */
export function pruneDatabaseConnectionTree(
  tree: readonly DatabaseConnectionTreeItem[],
  selectedIds: ReadonlySet<string>,
): DatabaseConnectionTreeItem[] {
  return pruneFolderTree(tree, selectedIds, isDatabaseConnectionFolder);
}

/**
 * Saved query tree prune (folder | query nodes).
 */
export function pruneQueryTree(
  tree: readonly SavedQueryTreeItem[],
  selectedIds: ReadonlySet<string>,
): SavedQueryTreeItem[] {
  return pruneFolderTree(tree, selectedIds, isSavedQueryFolder);
}

/**
 * Filters flow templates by id.
 */
export function pruneFlowTemplates<T extends FlowGraphTemplate>(
  templates: readonly T[],
  selectedIds: ReadonlySet<string>,
): T[] {
  return templates.filter((item) => selectedIds.has(item.id));
}

/**
 * All ids in a database connection subtree (includes the node itself).
 */
export function collectDatabaseTreeDescendantIds(node: DatabaseConnectionTreeItem): string[] {
  const ids = [node.id];
  if (isDatabaseConnectionFolder(node)) {
    for (const child of node.children)
      ids.push(...collectDatabaseTreeDescendantIds(child));
  }
  return ids;
}

/**
 * All ids in a saved query subtree (includes the node itself).
 */
export function collectQueryTreeDescendantIds(node: SavedQueryTreeItem): string[] {
  const ids = [node.id];
  if (isSavedQueryFolder(node)) {
    for (const child of node.children)
      ids.push(...collectQueryTreeDescendantIds(child));
  }
  return ids;
}

/**
 * Builds the JSON payload object for a workspace pack from live workspace files and a selection.
 */
export function buildPackPayload(
  workspaceFiles: Readonly<Record<string, unknown>>,
  selection: WorkspacePackSelection,
): WorkspacePackPayload {
  const payload: WorkspacePackPayload = {};
  const categories = new Set(selection.categories.filter(isPackCategory));

  for (const category of categories) {
    const fileName = PACK_CATEGORY_FILES[category];
    if (EXCLUDED_PACK_FILES.has(fileName))
      continue;
    const raw = workspaceFiles[fileName];
    if (raw === undefined || raw === null)
      continue;

    if (category === 'collections') {
      const source =
        raw && typeof raw === 'object' && !Array.isArray(raw)
          ? (raw as Record<string, unknown>)
          : {};
      const collections = Array.isArray(source['collections']) ? (source['collections'] as CollectionTree) : [];
      const ids = selectionIdSet(selection, 'collectionIds');
      const nextCollections = ids ? pruneCollectionTree(collections, ids) : collections;
      payload[fileName] = {
        ...source,
        collections: nextCollections,
      };
      continue;
    }

    if (category === 'flows') {
      const source =
        raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
      const items = Array.isArray(source['items']) ? (source['items'] as ServiceTreeNode<unknown>[]) : [];
      const ids = selectionIdSet(selection, 'flowIds');
      const nextItems = ids ? pruneServiceTree(items, ids) : items;
      payload[fileName] = { ...source, items: nextItems };
      continue;
    }

    if (category === 'mocks') {
      const source =
        raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
      const items = Array.isArray(source['items']) ? (source['items'] as ServiceTreeNode<unknown>[]) : [];
      const ids = selectionIdSet(selection, 'mockIds');
      const nextItems = ids ? pruneServiceTree(items, ids) : items;
      payload[fileName] = { ...source, items: nextItems };
      continue;
    }

    if (category === 'environments') {
      const source =
        raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as EnvironmentsFile) : null;
      if (!source)
        continue;
      const ids = selectionIdSet(selection, 'environmentIds');
      payload[fileName] = ids ? pruneEnvironmentsFile(source, ids) : source;
      continue;
    }

    if (category === 'database') {
      const source =
        raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
      const nodes = Array.isArray(source['nodes'])
        ? (source['nodes'] as DatabaseConnectionTreeItem[])
        : [];
      const ids = selectionIdSet(selection, 'databaseIds');
      const nextNodes = ids ? pruneDatabaseConnectionTree(nodes, ids) : nodes;
      payload[fileName] = { ...source, nodes: nextNodes };
      continue;
    }

    if (category === 'queries') {
      const source =
        raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
      const nodes = Array.isArray(source['nodes']) ? (source['nodes'] as SavedQueryTreeItem[]) : [];
      const ids = selectionIdSet(selection, 'queryIds');
      const nextNodes = ids ? pruneQueryTree(nodes, ids) : nodes;
      payload[fileName] = { ...source, nodes: nextNodes };
      continue;
    }

    if (category === 'load') {
      const source =
        raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
      const items = Array.isArray(source['items']) ? (source['items'] as ServiceTreeNode<unknown>[]) : [];
      const ids = selectionIdSet(selection, 'loadIds');
      const nextItems = ids ? pruneServiceTree(items, ids) : items;
      payload[fileName] = { ...source, items: nextItems };
      continue;
    }

    if (category === 'intercept') {
      const source =
        raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
      const items = Array.isArray(source['items']) ? (source['items'] as ServiceTreeNode<unknown>[]) : [];
      const ids = selectionIdSet(selection, 'interceptIds');
      const nextItems = ids ? pruneServiceTree(items, ids) : items;
      payload[fileName] = { ...source, items: nextItems };
      continue;
    }

    if (category === 'regressions') {
      const source =
        raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
      const items = Array.isArray(source['items']) ? (source['items'] as ServiceTreeNode<unknown>[]) : [];
      const ids = selectionIdSet(selection, 'regressionIds');
      const nextItems = ids ? pruneServiceTree(items, ids) : items;
      payload[fileName] = { ...source, items: nextItems };
      continue;
    }

    if (category === 'flow-templates') {
      const source =
        raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
      const templates = Array.isArray(source['templates'])
        ? (source['templates'] as FlowGraphTemplate[])
        : [];
      const ids = selectionIdSet(selection, 'flowTemplateIds');
      const nextTemplates = ids ? pruneFlowTemplates(templates, ids) : templates;
      payload[fileName] = { ...source, templates: nextTemplates };
      continue;
    }

    payload[fileName] = raw;
  }

  return payload;
}

/**
 * Serializes a pack payload to string entries suitable for {@link computePackChecksum}.
 */
export function packPayloadToChecksumEntries(payload: WorkspacePackPayload): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const name of Object.keys(payload).sort((left, right) => left.localeCompare(right))) {
    if (EXCLUDED_PACK_FILES.has(name))
      continue;
    if (!CONFIG_WORKSPACE_FILES.includes(name as ConfigWorkspaceFileName))
      continue;
    entries[name] = stableJson(payload[name]);
  }
  return entries;
}

export interface MergeCollectionTreesOptions {
  readonly remintIds: boolean;
  readonly nameSuffix?: string;
}

/**
 * Appends an imported collection tree onto an existing tree, optionally reminting ids and suffixing root names.
 */
export function mergeCollectionTrees(
  existing: CollectionTree,
  incoming: CollectionTree,
  options: MergeCollectionTreesOptions,
): CollectionTree {
  let roots = incoming;
  if (options.remintIds)
    roots = remintCollectionTree(roots);
  if (options.nameSuffix) {
    roots = roots.map((node) => ({
      ...node,
      name: `${node.name}${options.nameSuffix}`,
    }));
  }
  return [...existing, ...roots];
}

export interface MergeServiceTreesOptions {
  readonly remintIds: boolean;
  readonly nameSuffix?: string;
}

function remintServiceNode<T>(node: ServiceTreeNode<T>): ServiceTreeNode<T> {
  if (node.kind === 'folder') {
    return {
      ...node,
      id: newServiceNodeId(),
      children: node.children.map((child) => remintServiceNode(child)),
    };
  }
  return { ...node, id: newServiceNodeId() };
}

function remintServiceTree<T>(tree: readonly ServiceTreeNode<T>[]): ServiceTreeNode<T>[] {
  return tree.map((node) => remintServiceNode(node));
}

/**
 * Appends an imported service tree (flows/mocks) onto an existing tree.
 */
export function mergeServiceTrees<T>(
  existing: readonly ServiceTreeNode<T>[],
  incoming: readonly ServiceTreeNode<T>[],
  options: MergeServiceTreesOptions,
): ServiceTreeNode<T>[] {
  let roots = [...incoming];
  if (options.remintIds)
    roots = remintServiceTree(roots);
  if (options.nameSuffix) {
    roots = roots.map((node) => ({
      ...node,
      name: `${node.name}${options.nameSuffix}`,
    }));
  }
  return [...existing, ...roots];
}

/**
 * All ids in a collection subtree (includes the node itself).
 */
export function collectCollectionDescendantIds(node: CollectionNode): string[] {
  if (node.kind !== 'folder')
    return [node.id];
  const ids = [node.id];
  for (const child of node.children)
    ids.push(...collectCollectionDescendantIds(child));
  return ids;
}

/**
 * All ids in a service subtree (includes the node itself).
 */
export function collectServiceDescendantIds<T>(node: ServiceTreeNode<T>): string[] {
  if (node.kind !== 'folder')
    return [node.id];
  const ids = [node.id];
  for (const child of node.children)
    ids.push(...collectServiceDescendantIds(child));
  return ids;
}

/**
 * Tri-state checkbox state for a tree node id against a selection set.
 */
export function selectionCheckState(
  nodeId: string,
  selectedIds: ReadonlySet<string>,
  getDescendantIds: (id: string) => readonly string[],
): SelectionCheckState {
  const descendants = getDescendantIds(nodeId);
  if (descendants.length === 0)
    return selectedIds.has(nodeId) ? 'checked' : 'unchecked';
  const selectedCount = descendants.filter((id) => selectedIds.has(id)).length;
  if (selectedCount === 0)
    return 'unchecked';
  if (selectedCount === descendants.length)
    return 'checked';
  return 'indeterminate';
}

/**
 * Toggles a node and all descendants on or off in a selection set.
 */
export function toggleTreeSelection(
  selectedIds: ReadonlySet<string>,
  nodeId: string,
  descendantIds: readonly string[],
): Set<string> {
  const ids = descendantIds.length > 0 ? descendantIds : [nodeId];
  const allSelected = ids.every((id) => selectedIds.has(id));
  const next = new Set(selectedIds);
  if (allSelected) {
    for (const id of ids)
      next.delete(id);
    return next;
  }
  for (const id of ids)
    next.add(id);
  return next;
}
