import type { BrowserWindow } from 'electron';
import { dialog } from 'electron';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  PACK_CATEGORY_FILES,
  WORKSPACE_PACK_EXTENSION,
  buildPackPayload,
  computePackChecksum,
  convertBrunoCollection,
  convertOpenApi,
  convertPostmanCollectionV21,
  convertPostmanEnvironment,
  detectImportFormat,
  mergeCollectionTrees,
  mergeServiceTrees,
  packPayloadToChecksumEntries,
  parseCollectionsFile,
  parseEnvironmentsFile,
  parseFlowsFile,
  parseImportDocument,
  parseMocksFile,
  pruneCollectionTree,
  pruneServiceTree,
  stripPackSecrets,
  workspacePackManifestSchema,
  workspacePackSelectionSchema,
  nextEnvironmentId,
  type BrunoFileEntry,
  type CollectionTree,
  type ImportFormat,
  type PackCategory,
  type ServiceTreeNode,
  type WorkspaceExportPackResult,
  type WorkspaceImportApplyRequest,
  type WorkspaceImportInspectResult,
  type WorkspaceImportMode,
  type WorkspacePackManifest,
  type WorkspacePackPayload,
  type WorkspacePackSelection,
  type WorkspaceSnapshot,
} from '@testrix/contracts';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import type { ConfigStore } from './config.service';

const MANIFEST_NAME = 'manifest.json';
const PAYLOAD_PREFIX = 'payload/';
const IMPORT_EXTENSIONS = ['.testrix', '.json', '.yaml', '.yml', '.zip', '.bru'] as const;
const IMPORT_MAX_BYTES = 200 * 1024 * 1024;
const IMPORT_PATH_TTL_MS = 30 * 60 * 1000;

type GetMainWindow = () => BrowserWindow | null;

/**
 * Export/import workspace packs and third-party API collections in the main process.
 *
 * The renderer can only import paths main has seen come from the user: the open
 * dialog, a dropped file (registered by the preload), or a temp copy of dropped bytes.
 */
export class WorkspacePackHost {
  private readonly allowedImportPaths = new Map<string, number>();

  constructor(
    private readonly store: ConfigStore,
    private readonly getMainWindow: GetMainWindow,
    private readonly getAppVersion: () => string,
  ) {}

  /** Lets the renderer import `filePath` for the next 30 minutes. */
  allowImportPath(filePath: string): void {
    const now = Date.now();
    for (const [key, expiresAt] of this.allowedImportPaths) {
      if (expiresAt <= now)
        this.allowedImportPaths.delete(key);
    }
    this.allowedImportPaths.set(importPathKey(filePath), now + IMPORT_PATH_TTL_MS);
  }

  private async assertImportable(filePath: string): Promise<string> {
    const resolved = path.resolve(filePath);
    const expiresAt = this.allowedImportPaths.get(importPathKey(resolved));
    if (!expiresAt || expiresAt <= Date.now())
      throw new Error('Choose the file again with Import, or drop it onto the window.');
    const fileStat = await stat(resolved);
    if (fileStat.isDirectory())
      return resolved;
    const extension = path.extname(resolved).toLowerCase();
    if (!(IMPORT_EXTENSIONS as readonly string[]).includes(extension))
      throw new Error(`Testrix cannot import ${extension || 'files without an extension'}. Use ${IMPORT_EXTENSIONS.join(', ')}.`);
    if (fileStat.size > IMPORT_MAX_BYTES)
      throw new Error(`The file is larger than ${IMPORT_MAX_BYTES / (1024 * 1024)} MB.`);
    return resolved;
  }

  async exportPack(selection: WorkspacePackSelection): Promise<WorkspaceExportPackResult> {
    const parsedSelection = workspacePackSelectionSchema.parse(selection);
    await this.store.persistActiveWorkspace();

    const workspaceFiles = this.readWorkspaceFilesMap();
    let payload = buildPackPayload(workspaceFiles, parsedSelection);
    if (parsedSelection.omitSecrets)
      payload = stripPackSecrets(payload);
    const checksumEntries = packPayloadToChecksumEntries(payload);
    const checksum = await computePackChecksum(checksumEntries);
    const active = this.store.activeWorkspace();
    const manifest: WorkspacePackManifest = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      appVersion: this.getAppVersion(),
      checksum,
      selection: parsedSelection,
      sourceWorkspaceName: active?.name,
    };

    const zipEntries: Record<string, Uint8Array> = {
      [MANIFEST_NAME]: strToU8(JSON.stringify(manifest, null, 2)),
    };
    for (const [fileName, value] of Object.entries(payload)) {
      zipEntries[`${PAYLOAD_PREFIX}${fileName}`] = strToU8(JSON.stringify(value, null, 2));
    }
    const zipBytes = zipSync(zipEntries);

    const win = this.getMainWindow();
    const defaultBase = sanitizeFileBase(active?.name ?? 'workspace');
    const saveOptions = {
      title: 'Export Testrix pack',
      defaultPath: `${defaultBase}${WORKSPACE_PACK_EXTENSION}`,
      filters: [{ name: 'Testrix pack', extensions: ['testrix'] }],
    };
    const result = win
      ? await dialog.showSaveDialog(win, saveOptions)
      : await dialog.showSaveDialog(saveOptions);
    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }
    const targetPath = result.filePath.toLowerCase().endsWith(WORKSPACE_PACK_EXTENSION)
      ? result.filePath
      : `${result.filePath}${WORKSPACE_PACK_EXTENSION}`;
    await writeFile(targetPath, zipBytes);
    return { canceled: false, path: targetPath };
  }

  /**
   * Opens a file/folder picker for import sources (.testrix, JSON/YAML, Bruno).
   */
  async pickImportSource(): Promise<string | null> {
    const win = this.getMainWindow();
    const options = {
      title: 'Import into Testrix',
      properties: ['openFile', 'openDirectory'] as Array<
        'openFile' | 'openDirectory'
      >,
      filters: [
        {
          name: 'Importable',
          extensions: ['testrix', 'json', 'yaml', 'yml', 'zip', 'bru'],
        },
        { name: 'All files', extensions: ['*'] },
      ],
    };
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    const picked = result.canceled ? null : result.filePaths[0] ?? null;
    if (picked)
      this.allowImportPath(picked);
    return picked;
  }

  async importInspect(filePath: string): Promise<WorkspaceImportInspectResult> {
    return this.inspectResolved(await this.assertImportable(filePath));
  }

  private async inspectResolved(resolved: string): Promise<WorkspaceImportInspectResult> {
    const fileStat = await stat(resolved);
    if (fileStat.isDirectory()) {
      return this.inspectBrunoDirectory(resolved);
    }

    const lower = resolved.toLowerCase();
    if (lower.endsWith(WORKSPACE_PACK_EXTENSION) || isZipFile(resolved, lower)) {
      return this.inspectNativePack(resolved);
    }

    const text = await readFile(resolved, 'utf8');
    return this.inspectParsedDocument(resolved, path.basename(resolved), text);
  }

  /**
   * Inspects a dropped file from in-memory bytes (when File.path is unavailable across contextBridge).
   * Writes a temp file so importApply can re-read the same path.
   */
  async importInspectBytes(fileName: string, bytes: Uint8Array): Promise<WorkspaceImportInspectResult> {
    if (bytes.byteLength > IMPORT_MAX_BYTES)
      throw new Error(`The file is larger than ${IMPORT_MAX_BYTES / (1024 * 1024)} MB.`);
    const safeName = sanitizeImportFileName(fileName);
    const tempPath = path.join(os.tmpdir(), `testrix-import-${Date.now()}-${safeName}`);
    await writeFile(tempPath, Buffer.from(bytes));
    this.allowImportPath(tempPath);
    return this.importInspect(tempPath);
  }

  private inspectParsedDocument(
    resolvedPath: string,
    baseName: string,
    text: string,
  ): WorkspaceImportInspectResult {
    const document = parseImportDocument(text, baseName);
    const format = detectImportFormat(document, baseName);
    const warnings: string[] = [];
    if (format === 'unsupported') {
      return { format, path: resolvedPath, warnings: ['Unsupported import format.'] };
    }

    if (format === 'postman-collection') {
      const converted = convertPostmanCollectionV21(document);
      warnings.push(...converted.warnings);
      return {
        format,
        path: resolvedPath,
        warnings,
        sourceName: converted.name,
        selectionPreview: {
          categories: ['collections'],
          generatedCollections: converted.tree,
        },
      };
    }

    if (format === 'postman-environment') {
      const converted = convertPostmanEnvironment(document);
      warnings.push(...converted.warnings);
      return {
        format,
        path: resolvedPath,
        warnings,
        sourceName: converted.environment.name,
        selectionPreview: { categories: ['environments'] },
      };
    }

    if (format === 'openapi') {
      const converted = convertOpenApi(document);
      warnings.push(...converted.warnings);
      const categories = converted.environment ? ['collections', 'environments'] : ['collections'];
      return {
        format,
        path: resolvedPath,
        warnings,
        selectionPreview: {
          categories,
          generatedCollections: converted.tree,
        },
      };
    }

    if (format === 'bruno') {
      const converted = convertBrunoCollection(typeof document === 'string' ? document : text);
      warnings.push(...converted.warnings);
      return {
        format,
        path: resolvedPath,
        warnings,
        sourceName: converted.name,
        selectionPreview: {
          categories: ['collections'],
          generatedCollections: converted.tree,
        },
      };
    }

    return { format: 'unsupported', path: resolvedPath, warnings: ['Unsupported import format.'] };
  }

  async importApply(request: WorkspaceImportApplyRequest): Promise<WorkspaceSnapshot> {
    const req = {
      ...request,
      path: await this.assertImportable(request.path),
      selection: workspacePackSelectionSchema.parse(request.selection),
    };
    const inspected = await this.inspectResolved(req.path);
    if (inspected.format === 'native') {
      await this.applyNativePack(req.path, req.mode, req.selection, req.workspaceName);
      await this.store.persistActiveWorkspace();
      return this.store.workspaceSnapshot();
    }

    if (inspected.format === 'unsupported') {
      throw new Error('Cannot apply an unsupported import format.');
    }

    if (req.mode === 'new') {
      await this.store.createWorkspace(req.workspaceName?.trim() || inspected.sourceName || 'Imported workspace');
    }

    await this.applyExternalImport(inspected.format, req.path, req.mode, req.selection, inspected);
    await this.store.persistActiveWorkspace();
    return this.store.workspaceSnapshot();
  }

  private readWorkspaceFilesMap(): Record<string, unknown> {
    return {
      'collections.json': this.store.collections,
      'flows.json': this.store.flows,
      'mocks.json': this.store.mocksFile,
      'environments.json': this.store.environments,
      'database.json': this.store.databases,
      'queries.json': this.store.queries,
      'history.json': this.store.history,
      'cookies.json': this.store.cookies,
      'load.json': this.store.loadFile,
      'listeners.json': this.store.listenersFile,
      'intercept.json': this.store.interceptFile,
      'regressions.json': this.store.regressions,
      'emulator.json': this.store.emulator,
      'flow-templates.json': this.store.flowTemplates,
      'plantuml.json': this.store.plantumlFile,
    };
  }

  private async inspectNativePack(filePath: string): Promise<WorkspaceImportInspectResult> {
    const { manifest, payload, warnings } = await this.readNativePack(filePath);
    const checksumEntries = packPayloadToChecksumEntries(payload);
    const checksumOk = manifest.checksum === (await computePackChecksum(checksumEntries));
    if (!checksumOk)
      warnings.push('Pack checksum does not match payload contents.');

    const categories = manifest.selection.categories.filter((entry) => isPackCategoryKey(entry));
    const collectionsRaw = payload['collections.json'];
    const flowsRaw = payload['flows.json'];
    const mocksRaw = payload['mocks.json'];
    const collections = collectionsRaw ? parseCollectionsFile(collectionsRaw).collections : undefined;
    const flows = flowsRaw ? parseFlowsFile(flowsRaw).items : undefined;
    const mocks = mocksRaw ? parseMocksFile(mocksRaw).items : undefined;

    return {
      format: 'native',
      path: filePath,
      warnings,
      sourceName: manifest.sourceWorkspaceName,
      checksumOk,
      selectionPreview: {
        categories,
        collections,
        flows: flows as ServiceTreeNode<unknown>[] | undefined,
        mocks: mocks as ServiceTreeNode<unknown>[] | undefined,
      },
    };
  }

  private async inspectBrunoDirectory(dirPath: string): Promise<WorkspaceImportInspectResult> {
    const files = await readBrunoFilesRecursive(dirPath);
    const converted = convertBrunoCollection(files);
    return {
      format: 'bruno',
      path: dirPath,
      warnings: converted.warnings,
      sourceName: converted.name ?? path.basename(dirPath),
      selectionPreview: {
        categories: ['collections'],
        generatedCollections: converted.tree,
      },
    };
  }

  private async readNativePack(filePath: string): Promise<{
    readonly manifest: WorkspacePackManifest;
    readonly payload: WorkspacePackPayload;
    readonly warnings: string[];
  }> {
    const warnings: string[] = [];
    const bytes = new Uint8Array(await readFile(filePath));
    const unzipped = unzipSync(bytes);
    const manifestEntry = unzipped[MANIFEST_NAME];
    if (!manifestEntry) {
      throw new Error('Pack is missing manifest.json.');
    }
    const manifestRaw = JSON.parse(strFromU8(manifestEntry)) as unknown;
    const parsedManifest = workspacePackManifestSchema.safeParse(manifestRaw);
    if (!parsedManifest.success) {
      throw new Error('Pack manifest is invalid.');
    }
    const payload: WorkspacePackPayload = {};
    for (const [entryName, entryBytes] of Object.entries(unzipped)) {
      if (!entryName.startsWith(PAYLOAD_PREFIX))
        continue;
      const fileName = entryName.slice(PAYLOAD_PREFIX.length);
      if (!fileName.endsWith('.json'))
        continue;
      try {
        payload[fileName] = JSON.parse(strFromU8(entryBytes)) as unknown;
      } catch {
        warnings.push(`Skipped unreadable payload entry "${fileName}".`);
      }
    }
    return { manifest: parsedManifest.data, payload, warnings };
  }

  private async applyNativePack(
    filePath: string,
    mode: WorkspaceImportMode,
    selection: WorkspacePackSelection,
    workspaceName?: string,
  ): Promise<void> {
    const { payload } = await this.readNativePack(filePath);
    const selectedCategories = new Set(
      selection.categories.filter((entry): entry is PackCategory => isPackCategoryKey(entry)),
    );

    if (mode === 'new') {
      await this.store.createWorkspace(workspaceName?.trim() || 'Imported workspace');
    }

    for (const category of selectedCategories) {
      const fileName = PACK_CATEGORY_FILES[category];
      const incomingRaw = payload[fileName];
      if (incomingRaw === undefined)
        continue;

      if (category === 'collections') {
        await this.applyCollectionsCategory(incomingRaw, mode, selection.collectionIds);
        continue;
      }
      if (category === 'flows') {
        await this.applyFlowsCategory(incomingRaw, mode, selection.flowIds);
        continue;
      }
      if (category === 'mocks') {
        await this.applyMocksCategory(incomingRaw, mode, selection.mockIds);
        continue;
      }
      await this.applyWholeFileCategory(fileName, incomingRaw, mode);
    }
  }

  private async applyExternalImport(
    format: ImportFormat,
    filePath: string,
    mode: WorkspaceImportMode,
    selection: WorkspacePackSelection,
    inspected: WorkspaceImportInspectResult,
  ): Promise<void> {
    const wantsCollections = selection.categories.includes('collections');
    const wantsEnvironments = selection.categories.includes('environments');

    if (format === 'postman-environment' && wantsEnvironments) {
      const text = await readFile(filePath, 'utf8');
      const document = parseImportDocument(text, path.basename(filePath));
      const converted = convertPostmanEnvironment(document);
      await this.mergeImportedEnvironment(converted.environment.name, converted.environment.variables, mode);
      return;
    }

    if (format === 'openapi' && wantsEnvironments) {
      const text = await readFile(filePath, 'utf8');
      const document = parseImportDocument(text, path.basename(filePath));
      const converted = convertOpenApi(document);
      if (converted.environment) {
        await this.mergeImportedEnvironment(
          converted.environment.name,
          converted.environment.variables,
          mode,
        );
      }
    }

    if (!wantsCollections)
      return;

    let tree: CollectionTree = inspected.selectionPreview?.generatedCollections ?? [];
    if (tree.length === 0) {
      if (format === 'bruno' && (await stat(filePath)).isDirectory()) {
        const files = await readBrunoFilesRecursive(filePath);
        tree = convertBrunoCollection(files).tree;
      } else {
        const text = await readFile(filePath, 'utf8');
        const document = parseImportDocument(text, path.basename(filePath));
        if (format === 'postman-collection')
          tree = convertPostmanCollectionV21(document).tree;
        else if (format === 'openapi')
          tree = convertOpenApi(document).tree;
        else if (format === 'bruno')
          tree = convertBrunoCollection(typeof document === 'string' ? document : text).tree;
      }
    }

    if (selection.collectionIds?.length) {
      const pruned = pruneCollectionTree(tree, new Set(selection.collectionIds));
      tree = pruned.length > 0 || tree.length === 0 ? pruned : tree;
    }

    await this.applyCollectionsCategory({ collections: tree }, mode, selection.collectionIds);
  }

  private async applyCollectionsCategory(
    incomingRaw: unknown,
    mode: WorkspaceImportMode,
    selectedIds?: readonly string[],
  ): Promise<void> {
    const incoming = parseCollectionsFile(incomingRaw);
    let incomingTree = incoming.collections;
    if (selectedIds?.length) {
      const pruned = pruneCollectionTree(incomingTree, new Set(selectedIds));
      // ID mismatch (e.g. reminted preview) would otherwise import nothing.
      incomingTree = pruned.length > 0 || incomingTree.length === 0 ? pruned : incomingTree;
    }

    const existing = this.store.collections.collections;
    let nextTree: CollectionTree;
    if (mode === 'replace') {
      if (selectedIds?.length) {
        const removeIds = new Set(selectedIds);
        const kept = filterCollectionTree(existing, removeIds);
        nextTree = [...kept, ...incomingTree];
      } else {
        nextTree = incomingTree;
      }
    } else {
      nextTree = mergeCollectionTrees(existing, incomingTree, { remintIds: mode === 'merge' });
    }

    await this.store.patchCollections({ collections: nextTree });
  }

  private async applyFlowsCategory(
    incomingRaw: unknown,
    mode: WorkspaceImportMode,
    selectedIds?: readonly string[],
  ): Promise<void> {
    const incoming = parseFlowsFile(incomingRaw);
    let incomingItems = [...incoming.items];
    if (selectedIds?.length) {
      incomingItems = pruneServiceTree(incomingItems, new Set(selectedIds));
    }

    const existing = [...this.store.flows.items];
    let nextItems: typeof incomingItems;
    if (mode === 'replace') {
      if (selectedIds?.length) {
        const kept = filterServiceTree(existing, new Set(selectedIds));
        nextItems = [...kept, ...incomingItems];
      } else {
        nextItems = incomingItems;
      }
    } else {
      nextItems = mergeServiceTrees(existing, incomingItems, { remintIds: mode === 'merge' });
    }

    await this.store.patchFlows({ items: nextItems });
  }

  private async applyMocksCategory(
    incomingRaw: unknown,
    mode: WorkspaceImportMode,
    selectedIds?: readonly string[],
  ): Promise<void> {
    const incoming = parseMocksFile(incomingRaw);
    let incomingItems = [...incoming.items];
    if (selectedIds?.length) {
      incomingItems = pruneServiceTree(incomingItems, new Set(selectedIds));
    }

    const existing = [...this.store.mocksFile.items];
    let nextItems: typeof incomingItems;
    if (mode === 'replace') {
      if (selectedIds?.length) {
        const kept = filterServiceTree(existing, new Set(selectedIds));
        nextItems = [...kept, ...incomingItems];
      } else {
        nextItems = incomingItems;
      }
    } else {
      nextItems = mergeServiceTrees(existing, incomingItems, { remintIds: mode === 'merge' });
    }

    await this.store.patchMocks({ items: nextItems });
  }

  private async applyWholeFileCategory(
    fileName: string,
    incomingRaw: unknown,
    mode: WorkspaceImportMode,
  ): Promise<void> {
    if (mode === 'replace' || mode === 'new') {
      await this.replaceWholeFile(fileName, incomingRaw);
      return;
    }

    if (fileName === 'environments.json') {
      const incoming = parseEnvironmentsFile(incomingRaw);
      const mergedItems = [...this.store.environments.items];
      const addedIds: string[] = [];
      for (const item of incoming.items) {
        const id = nextEnvironmentId(mergedItems.map((entry) => entry.id));
        mergedItems.push({ ...item, id });
        addedIds.push(id);
      }
      await this.store.patchEnvironments({
        items: mergedItems,
        orderIds: [...this.store.environments.orderIds, ...addedIds],
      });
      return;
    }

    await this.replaceWholeFile(fileName, incomingRaw);
  }

  private async replaceWholeFile(fileName: string, incomingRaw: unknown): Promise<void> {
    switch (fileName) {
      case 'environments.json':
        await this.store.patchEnvironments(parseEnvironmentsFile(incomingRaw));
        break;
      case 'database.json':
        await this.store.patchDatabases(incomingRaw as Parameters<ConfigStore['patchDatabases']>[0]);
        break;
      case 'queries.json':
        await this.store.patchQueries(incomingRaw as Parameters<ConfigStore['patchQueries']>[0]);
        break;
      case 'history.json':
        await this.store.patchHistory(incomingRaw as Parameters<ConfigStore['patchHistory']>[0]);
        break;
      case 'cookies.json':
        await this.store.patchCookies(incomingRaw as Parameters<ConfigStore['patchCookies']>[0]);
        break;
      case 'load.json':
        await this.store.patchLoad(incomingRaw as Parameters<ConfigStore['patchLoad']>[0]);
        break;
      case 'listeners.json':
        await this.store.patchListeners(incomingRaw as Parameters<ConfigStore['patchListeners']>[0]);
        break;
      case 'intercept.json':
        await this.store.patchIntercept(incomingRaw as Parameters<ConfigStore['patchIntercept']>[0]);
        break;
      case 'plantuml.json':
        await this.store.patchPlantuml(incomingRaw as Parameters<ConfigStore['patchPlantuml']>[0]);
        break;
      case 'regressions.json':
        await this.store.patchRegressions(incomingRaw as Parameters<ConfigStore['patchRegressions']>[0]);
        break;
      case 'flow-templates.json':
        await this.store.patchFlowTemplates(incomingRaw as Parameters<ConfigStore['patchFlowTemplates']>[0]);
        break;
      case 'emulator.json':
        await this.store.patchEmulator(incomingRaw as Parameters<ConfigStore['patchEmulator']>[0]);
        break;
      default:
        break;
    }
  }

  private async mergeImportedEnvironment(
    name: string,
    variables: readonly {
      readonly key: string;
      readonly value: string;
      readonly enabled: boolean;
      readonly secret: boolean;
    }[],
    mode: WorkspaceImportMode,
  ): Promise<void> {
    const id = nextEnvironmentId(this.store.environments.items.map((item) => item.id));
    const now = new Date().toISOString();
    const item = {
      id,
      name: mode === 'replace' ? name : `${name} (imported)`,
      modifiedAt: now,
      variables: variables.map((variable, index) => ({
        kind: 'variable' as const,
        id: `${id}-var-${index + 1}`,
        key: variable.key,
        value: variable.value,
        description: '',
        enabled: variable.enabled,
        secret: variable.secret,
      })),
    };
    const items = mode === 'replace' ? [item] : [...this.store.environments.items, item];
    const orderIds = mode === 'replace' ? [item.id] : [...this.store.environments.orderIds, item.id];
    await this.store.patchEnvironments({
      items,
      orderIds,
      activeId: this.store.environments.activeId ?? item.id,
    });
  }
}

function isPackCategoryKey(value: string): value is PackCategory {
  return value in PACK_CATEGORY_FILES;
}

function sanitizeFileBase(name: string): string {
  const trimmed = name.replace(/[<>:"/\\|?*]/g, '_').trim();
  return trimmed || 'workspace';
}

function importPathKey(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function sanitizeImportFileName(fileName: string): string {
  const base = path.basename(fileName).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  return base || 'import.bin';
}

function isZipFile(resolvedPath: string, lowerPath: string): boolean {
  if (lowerPath.endsWith('.zip'))
    return true;
  return false;
}

function filterCollectionTree(tree: CollectionTree, removeIds: ReadonlySet<string>): CollectionTree {
  const out: CollectionTree = [];
  for (const node of tree) {
    if (removeIds.has(node.id))
      continue;
    if (node.kind === 'folder') {
      out.push({ ...node, children: filterCollectionTree(node.children, removeIds) });
      continue;
    }
    out.push(node);
  }
  return out;
}

function filterServiceTree<T>(
  tree: readonly ServiceTreeNode<T>[],
  removeIds: ReadonlySet<string>,
): ServiceTreeNode<T>[] {
  const out: ServiceTreeNode<T>[] = [];
  for (const node of tree) {
    if (removeIds.has(node.id))
      continue;
    if (node.kind === 'folder') {
      out.push({ ...node, children: filterServiceTree(node.children, removeIds) });
      continue;
    }
    out.push(node);
  }
  return out;
}

async function readBrunoFilesRecursive(dirPath: string, relative = ''): Promise<BrunoFileEntry[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files: BrunoFileEntry[] = [];
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    const relPath = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await readBrunoFilesRecursive(entryPath, relPath)));
      continue;
    }
    if (!entry.isFile())
      continue;
    const lower = entry.name.toLowerCase();
    if (!lower.endsWith('.bru') && lower !== 'collection.json' && !lower.endsWith('bruno.json'))
      continue;
    const content = await readFile(entryPath, 'utf8');
    files.push({ path: relPath.replace(/\\/g, '/'), content });
  }
  return files;
}
