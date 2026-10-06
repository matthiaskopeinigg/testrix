import { type GlobalPositionStrategy, Overlay, type OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  effect,
  inject,
  Injector,
  input,
  signal,
  untracked,
  viewChild,
  ViewContainerRef,
  type TemplateRef,
} from '@angular/core';
import {
  environmentFolderCount,
  findEnabledEnvironmentVariableByKey,
  findEnvironmentFolder,
  findEnvironmentLocation,
  insertEnvironmentNodeAt,
  isEnvironmentDescendant,
  isEnvironmentFolder,
  isEnvironmentVariable,
  mapEnvironmentNodes,
  newEntityId,
  type Environment,
  type EnvironmentFolder,
  type EnvironmentNode,
  type EnvironmentVariable,
} from '@testrix/contracts';
import {
  TxButtonComponent,
  TxCheckComponent,
  TxEmptyStateComponent,
  TxHintComponent,
  TxInputComponent,
  playLeaveThen,
} from '@testrix/ui';

import { ConfirmDialogService } from '../../../core/confirm-dialog.service';
import {
  isRangeModifier,
  isToggleModifier,
  shouldKeepPointerSelection,
} from '../../../core/range-select';
import { EnvironmentsStore } from '../../environments/environments.store';
import { EnvironmentEditorDndService } from './environment-editor-dnd.service';
import { EnvironmentTreeComponent } from './environment-tree.component';
import type {
  EnvironmentTreeMenuRequest,
  EnvironmentTreeSelectRequest,
} from './environment-tree-node.component';
import type { WorkbenchTab } from '../workbench.store';

function emptyVariable(id: string): EnvironmentVariable {
  return {
    kind: 'variable',
    id,
    key: '',
    value: '',
    description: '',
    enabled: true,
    secret: false,
  };
}

function readText(value: string | null | undefined): string {
  if (!value || value === 'undefined') {
    return '';
  }
  return value;
}

function nodeMatches(node: EnvironmentNode, needle: string): boolean {
  if (isEnvironmentFolder(node)) {
    if (
      node.name.toLowerCase().includes(needle) ||
      readText(node.description).toLowerCase().includes(needle)
    ) {
      return true;
    }
    return node.children.some((child) => nodeMatches(child, needle));
  }
  return (
    node.key.toLowerCase().includes(needle) ||
    node.value.toLowerCase().includes(needle) ||
    readText(node.description).toLowerCase().includes(needle)
  );
}

function filterTree(nodes: readonly EnvironmentNode[], needle: string): EnvironmentNode[] {
  if (!needle) {
    return [...nodes];
  }
  const next: EnvironmentNode[] = [];
  for (const node of nodes) {
    if (isEnvironmentFolder(node)) {
      if (
        node.name.toLowerCase().includes(needle) ||
        readText(node.description).toLowerCase().includes(needle)
      ) {
        next.push(node);
        continue;
      }
      const children = filterTree(node.children, needle);
      if (children.length > 0) {
        next.push({ ...node, collapsed: false, children });
      }
      continue;
    }
    if (nodeMatches(node, needle)) {
      next.push(node);
    }
  }
  return next;
}

function countVariables(nodes: readonly EnvironmentNode[]): number {
  let total = 0;
  for (const node of nodes) {
    if (isEnvironmentFolder(node)) {
      total += countVariables(node.children);
      continue;
    }
    total += 1;
  }
  return total;
}

function countFolders(nodes: readonly EnvironmentNode[]): number {
  let total = 0;
  for (const node of nodes) {
    if (!isEnvironmentFolder(node)) {
      continue;
    }
    total += 1 + countFolders(node.children);
  }
  return total;
}

function collapseDeleteIds(nodes: readonly EnvironmentNode[], ids: readonly string[]): string[] {
  const unique = [...new Set(ids)];
  return unique.filter((id) => !unique.some((other) => other !== id && isEnvironmentDescendant(nodes, other, id)));
}

interface EnvMenu {
  readonly kind: 'folder' | 'variable' | 'root';
  readonly id: string | null;
  readonly parentId: string | null;
  readonly name: string;
  readonly secret: boolean;
  readonly x: number;
  readonly y: number;
}

@Component({
  selector: 'tx-environment-editor',
  standalone: true,
  imports: [
    TxButtonComponent,
    TxCheckComponent,
    TxEmptyStateComponent,
    TxHintComponent,
    TxInputComponent,
    EnvironmentTreeComponent,
  ],
  templateUrl: './environment-editor.component.html',
  styleUrl: './environment-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [EnvironmentEditorDndService],
})
export class EnvironmentEditorComponent {
  readonly tab = input.required<WorkbenchTab>();
  private readonly environments = inject(EnvironmentsStore);
  private readonly confirm = inject(ConfirmDialogService);
  readonly dnd = inject(EnvironmentEditorDndService);
  private readonly injector = inject(Injector);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly overlay = inject(Overlay);
  private readonly vcr = inject(ViewContainerRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly menuTemplate = viewChild.required<TemplateRef<unknown>>('envMenu');
  private readonly treeList = viewChild<ElementRef<HTMLElement>>('treeList');

  readonly query = signal('');
  readonly revealed = signal<ReadonlySet<string>>(new Set());
  readonly menu = signal<EnvMenu | null>(null);
  readonly renamingId = signal<string | null>(null);
  readonly selectedId = signal<string | null>(null);
  private overlayRef: OverlayRef | null = null;
  private menuCloseToken = 0;
  private lastEnvId: string | null = null;
  private lastFocusNonce = 0;

  constructor() {
    this.destroyRef.onDestroy(() => this.closeMenu(true));
    effect(() => {
      const env = this.environment();
      const envId = env?.id ?? null;
      if (envId === this.lastEnvId) {
        return;
      }
      this.lastEnvId = envId;
      this.selectedId.set(env ? this.environments.nodeSelectionFor(env.id).paneId : null);
    });
    effect(() => {
      const tab = this.tab();
      const env = this.environment();
      const key = tab.environmentFocusKey?.trim() ?? '';
      const nonce = tab.environmentFocusNonce ?? 0;
      if (!env || !key || nonce === this.lastFocusNonce)
        return;
      this.lastFocusNonce = nonce;
      untracked(() => this.revealVariableByKey(env, key));
    });
  }

  readonly environment = () => this.environments.environmentById(this.tab().nodeId);

  nodes(): EnvironmentNode[] {
    const env = this.environment();
    return env?.variables ?? [];
  }

  visibleTree(): EnvironmentNode[] {
    return filterTree(this.nodes(), this.query().trim().toLowerCase());
  }

  visibleIds(): string[] {
    const ids: string[] = [];
    const walk = (list: readonly EnvironmentNode[]): void => {
      for (const node of list) {
        ids.push(node.id);
        if (isEnvironmentFolder(node) && !node.collapsed) {
          walk(node.children);
        }
      }
    };
    walk(this.visibleTree());
    return ids;
  }

  selectedIds(): readonly string[] {
    const env = this.environment();
    return env ? this.environments.nodeSelectionFor(env.id).ids : [];
  }

  focusedNode(): EnvironmentNode | null {
    const id = this.selectedId();
    if (!id) {
      return null;
    }
    return findEnvironmentLocation(this.nodes(), id)?.node ?? null;
  }

  focusedVariable(): EnvironmentVariable | null {
    const node = this.focusedNode();
    return node && isEnvironmentVariable(node) ? node : null;
  }

  /** Short `{{key}}` usage, plus the folder path when the variable is nested. */
  variableReferenceLabel(): string {
    const variable = this.focusedVariable();
    const env = this.environment();
    const key = variable?.key.trim() ?? '';
    if (!variable || !env || !key)
      return '';
    const names: string[] = [];
    const seen = new Set<string>();
    let parentId = findEnvironmentLocation(env.variables, variable.id)?.parentId ?? null;
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      const folder = findEnvironmentFolder(env.variables, parentId);
      if (folder?.name.trim())
        names.unshift(folder.name.trim());
      parentId = folder ? (findEnvironmentLocation(env.variables, parentId)?.parentId ?? null) : null;
    }
    const short = `{{${key}}}`;
    const pathKey = [...names, key].join('.');
    if (names.length === 0 || !/^[A-Za-z0-9_.-]+$/.test(pathKey))
      return `Requests use ${short}`;
    return `Requests use ${short}. {{${pathKey}}} is the same variable.`;
  }

  focusedFolder(): EnvironmentFolder | null {
    const node = this.focusedNode();
    return node && isEnvironmentFolder(node) ? node : null;
  }

  inspectorMode(): 'variable' | 'folder' | 'bulk' | 'empty' {
    if (this.selectedIds().length > 1) {
      return 'bulk';
    }
    const node = this.focusedNode();
    if (node && isEnvironmentVariable(node)) {
      return 'variable';
    }
    if (node && isEnvironmentFolder(node)) {
      return 'folder';
    }
    return 'empty';
  }

  bulkCount(): number {
    return this.selectedIds().length;
  }

  folderVariableCount(folder: EnvironmentFolder): number {
    return countVariables(folder.children);
  }

  folderChildFolderCount(folder: EnvironmentFolder): number {
    return countFolders(folder.children);
  }

  isFiltering(): boolean {
    return this.query().trim().length > 0;
  }

  dragDisabled(): boolean {
    return this.isFiltering();
  }

  text(value: string | null | undefined): string {
    return readText(value);
  }

  isRevealed(id: string): boolean {
    return this.revealed().has(id);
  }

  menuTargetId(): string | null {
    return this.menu()?.id ?? null;
  }

  handleSelect(request: EnvironmentTreeSelectRequest): void {
    const env = this.environment();
    if (!env || this.renamingId() === request.node.id) {
      return;
    }
    if (
      shouldKeepPointerSelection({
        event: request.event,
        selectedIds: this.selectedIds(),
        targetId: request.node.id,
      })
    ) {
      return;
    }
    this.environments.applyNodePointerSelect(env.id, request.node.id, this.visibleIds(), request.event);
    if (isRangeModifier(request.event) || isToggleModifier(request.event)) {
      return;
    }
    this.setPane(request.node.id);
  }

  handleToggle(id: string): void {
    this.patchNode(id, (node) =>
      isEnvironmentFolder(node) ? { ...node, collapsed: !node.collapsed } : node,
    );
  }

  handleTreeChromeClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (target.closest('[data-env-node-id], button, input')) {
      return;
    }
    const env = this.environment();
    if (env) {
      this.environments.clearNodeSelection(env.id);
    }
  }

  handleSearch(value: string): void {
    this.query.set(value);
  }

  handleExpandFromDrag(id: string): void {
    this.patchNode(id, (node) =>
      isEnvironmentFolder(node) ? { ...node, collapsed: false } : node,
    );
  }

  addParentId(): string | null {
    const node = this.focusedNode();
    if (!node) {
      return null;
    }
    if (isEnvironmentFolder(node)) {
      return node.id;
    }
    return findEnvironmentLocation(this.nodes(), node.id)?.parentId ?? null;
  }

  handleAddFolder(parentId: string | null = this.addParentId()): void {
    const env = this.environment();
    if (!env) {
      return;
    }
    const id = newEntityId();
    const siblings = parentId ? (findEnvironmentFolder(env.variables, parentId)?.children ?? []) : env.variables;
    const index = environmentFolderCount(siblings);
    let next = insertEnvironmentNodeAt(env.variables, parentId, index, {
      kind: 'folder',
      id,
      name: '',
      description: '',
      collapsed: false,
      children: [],
    });
    if (parentId) {
      next = mapEnvironmentNodes(next, parentId, (node) =>
        isEnvironmentFolder(node) ? { ...node, collapsed: false } : node,
      );
    }
    this.environments.setVariables(env.id, next);
    this.selectAndFocus(id);
    this.closeMenu();
    this.startRename(id);
  }

  handleAddVariable(parentId: string | null = this.addParentId()): void {
    const env = this.environment();
    if (!env) {
      return;
    }
    const id = newEntityId();
    const siblings = parentId ? (findEnvironmentFolder(env.variables, parentId)?.children ?? []) : env.variables;
    let next = insertEnvironmentNodeAt(env.variables, parentId, siblings.length, emptyVariable(id));
    if (parentId) {
      next = mapEnvironmentNodes(next, parentId, (node) =>
        isEnvironmentFolder(node) ? { ...node, collapsed: false } : node,
      );
    }
    this.environments.setVariables(env.id, next);
    this.selectAndFocus(id);
    this.closeMenu();
    this.focusSelector('#env-var-key');
  }

  handleRenameStart(id: string): void {
    this.setPane(id);
    this.startRename(id);
  }

  startRename(id: string): void {
    this.renamingId.set(id);
    this.closeMenu();
    this.focusSelector(`[data-env-focus="${id}"]`);
  }

  finishRename(): void {
    this.renamingId.set(null);
  }

  handleFolderRenameKey(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== 'Escape') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.finishRename();
  }

  handleFolderName(event: { readonly id: string; readonly value: string }): void {
    this.patchNode(event.id, (node) =>
      isEnvironmentFolder(node) ? { ...node, name: event.value } : node,
    );
  }

  handleFolderTitle(value: string): void {
    const folder = this.focusedFolder();
    if (!folder) {
      return;
    }
    this.patchNode(folder.id, (node) =>
      isEnvironmentFolder(node) ? { ...node, name: value } : node,
    );
  }

  handleFolderDescription(value: string): void {
    const folder = this.focusedFolder();
    if (!folder) {
      return;
    }
    this.patchNode(folder.id, (node) =>
      isEnvironmentFolder(node) ? { ...node, description: value } : node,
    );
  }

  handleDeleteIds(ids: readonly string[]): void {
    const env = this.environment();
    if (!env || ids.length === 0) {
      return;
    }
    const removing = collapseDeleteIds(env.variables, ids);
    const focused = this.selectedId();
    let next = env.variables;
    for (const id of removing) {
      next = mapEnvironmentNodes(next, id, () => null);
    }
    this.environments.setVariables(env.id, next);
    if (focused && (removing.includes(focused) || removing.some((id) => isEnvironmentDescendant(env.variables, id, focused)))) {
      this.setPane(null);
    }
    this.closeMenu();
  }

  handleKey(value: string): void {
    const variable = this.focusedVariable();
    if (!variable) {
      return;
    }
    this.patchVariable(variable, { key: value });
  }

  handleValue(value: string): void {
    const variable = this.focusedVariable();
    if (!variable) {
      return;
    }
    this.patchVariable(variable, { value: value });
  }

  handleDescription(value: string): void {
    const variable = this.focusedVariable();
    if (!variable) {
      return;
    }
    this.patchVariable(variable, { description: value });
  }

  handleSecretToggle(): void {
    const variable = this.focusedVariable();
    if (!variable) {
      return;
    }
    this.patchVariable(variable, { secret: !variable.secret });
  }

  handleEnabledToggle(): void {
    const variable = this.focusedVariable();
    if (!variable) {
      return;
    }
    this.patchVariable(variable, { enabled: !variable.enabled });
  }

  handleReveal(id: string): void {
    const next = new Set(this.revealed());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.revealed.set(next);
    this.closeMenu();
  }

  handleNodeMenu(request: EnvironmentTreeMenuRequest): void {
    const { node, parentId, event } = request;
    if (isEnvironmentFolder(node)) {
      this.openMenu(event, {
        kind: 'folder',
        id: node.id,
        parentId,
        name: node.name,
        secret: false,
      });
      return;
    }
    this.openMenu(event, {
      kind: 'variable',
      id: node.id,
      parentId,
      name: node.key,
      secret: node.secret,
    });
  }

  handleRootMenu(event: Event): void {
    this.openMenu(event, {
      kind: 'root',
      id: null,
      parentId: null,
      name: 'Environment',
      secret: false,
    });
  }

  handleRenameFromMenu(): void {
    const menu = this.menu();
    if (!menu?.id || menu.kind !== 'folder') {
      this.closeMenu();
      return;
    }
    this.handleRenameStart(menu.id);
  }

  handleAddVariableFromMenu(): void {
    const menu = this.menu();
    const parentId = menu?.kind === 'folder' ? menu.id : (menu?.parentId ?? this.addParentId());
    this.closeMenu();
    this.handleAddVariable(parentId);
  }

  handleAddFolderFromMenu(): void {
    const menu = this.menu();
    const parentId = menu?.kind === 'folder' ? menu.id : this.addParentId();
    this.closeMenu();
    this.handleAddFolder(parentId);
  }

  handleMenuDelete(): void {
    const menu = this.menu();
    this.closeMenu();
    const selected = this.selectedIds();
    const targetId = menu?.id;
    const ids =
      targetId && selected.includes(targetId) && selected.length > 1 ? [...selected] : targetId ? [targetId] : [];
    if (ids.length === 0) {
      return;
    }
    void this.confirmDelete(ids);
  }

  handleBulkDelete(): void {
    void this.confirmDelete([...this.selectedIds()]);
  }

  handleMenuSecret(): void {
    const menu = this.menu();
    if (!menu?.id || menu.kind !== 'variable') {
      this.closeMenu();
      return;
    }
    this.patchNode(menu.id, (node) =>
      isEnvironmentFolder(node) ? node : { ...node, secret: !node.secret },
    );
    this.closeMenu();
  }

  handleMenuReveal(): void {
    const menu = this.menu();
    if (!menu?.id) {
      this.closeMenu();
      return;
    }
    this.handleReveal(menu.id);
  }

  closeMenu(immediate = false): void {
    const overlayRef = this.overlayRef;
    this.menuCloseToken += 1;
    const token = this.menuCloseToken;
    if (!overlayRef) {
      this.menu.set(null);
      return;
    }
    const dispose = (): void => {
      if (token !== this.menuCloseToken)
        return;
      overlayRef.dispose();
      if (this.overlayRef === overlayRef) {
        this.overlayRef = null;
        this.menu.set(null);
      }
    };
    if (immediate) {
      dispose();
      return;
    }
    const menu = overlayRef.overlayElement.querySelector('.tx-menu');
    playLeaveThen(menu instanceof HTMLElement ? menu : null, dispose);
  }

  @HostListener('document:keydown', ['$event'])
  handleDocumentKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') {
      return;
    }
    if (this.confirm.request()) {
      return;
    }
    if (this.menu()) {
      event.preventDefault();
      this.closeMenu();
      return;
    }
    if (this.renamingId()) {
      event.preventDefault();
      this.finishRename();
      return;
    }
    const env = this.environment();
    if (env && this.environments.nodeSelectionFor(env.id).ids.length > 0) {
      event.preventDefault();
      this.environments.clearNodeSelection(env.id);
    }
  }

  @HostListener('window:resize')
  handleWindowResize(): void {
    this.closeMenu();
  }

  syncDnd(): void {
    this.dnd.register({
      envId: this.environment()?.id ?? null,
      host: this.host.nativeElement,
      treeScroller: this.treeList()?.nativeElement ?? null,
      getNodes: () => this.nodes(),
      onExpand: (id) => this.handleExpandFromDrag(id),
    });
  }

  private async confirmDelete(ids: readonly string[]): Promise<void> {
    const env = this.environment();
    if (!env || ids.length === 0) {
      return;
    }
    const removing = collapseDeleteIds(env.variables, ids);
    const many = removing.length > 1;
    const first = findEnvironmentLocation(env.variables, removing[0] ?? '')?.node ?? null;
    const folder = first !== null && isEnvironmentFolder(first);
    const name = first
      ? folder
        ? first.name.trim() || 'Untitled folder'
        : first.key.trim() || 'this variable'
      : 'these items';
    const ok = await this.confirm.ask({
      title: many ? 'Delete selected items?' : folder ? 'Delete folder?' : 'Delete variable?',
      body: many
        ? `This deletes ${removing.length} items. Folders take their contents with them.`
        : folder
          ? `This deletes ${name} and every variable inside it.`
          : `This deletes ${name} from this environment.`,
      confirmLabel: many ? 'Delete items' : folder ? 'Delete folder' : 'Delete variable',
    });
    if (ok) {
      this.handleDeleteIds(removing);
    }
  }

  private openMenu(event: Event, partial: Omit<EnvMenu, 'x' | 'y'>): void {
    if (!(event instanceof MouseEvent)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.closeMenu(true);
    const x = event.clientX;
    const y = event.clientY;
    this.menu.set({
      ...partial,
      x,
      y,
    });
    const position = this.overlay.position().global();
    const overlayRef = this.overlay.create({
      positionStrategy: position,
      scrollStrategy: this.overlay.scrollStrategies.close(),
      panelClass: 'tx-overlay-menu',
    });
    overlayRef.attach(new TemplatePortal(this.menuTemplate(), this.vcr));
    this.overlayRef = overlayRef;
    this.placeMenu(overlayRef, position, x, y);
    requestAnimationFrame(() => {
      if (this.overlayRef === overlayRef) {
        this.placeMenu(overlayRef, position, x, y);
      }
    });
    window.setTimeout(() => {
      if (this.overlayRef !== overlayRef) {
        return;
      }
      overlayRef.outsidePointerEvents().subscribe(() => this.closeMenu());
    });
  }

  private placeMenu(overlayRef: OverlayRef, position: GlobalPositionStrategy, x: number, y: number): void {
    const menu = overlayRef.overlayElement.querySelector('.tx-env-menu');
    const width = menu instanceof HTMLElement && menu.offsetWidth ? menu.offsetWidth : 188;
    const height = menu instanceof HTMLElement && menu.offsetHeight ? menu.offsetHeight : 160;
    const margin = 8;
    const left = x + width > window.innerWidth - margin ? Math.max(margin, x - width) : x;
    const top = y + height > window.innerHeight - margin ? Math.max(margin, y - height) : y;
    position.left(`${left}px`).top(`${top}px`);
    overlayRef.updatePosition();
  }

  private selectAndFocus(id: string): void {
    const env = this.environment();
    if (!env) {
      return;
    }
    this.environments.setNodeSelection(env.id, { ids: [id], anchorId: id, paneId: id });
    this.selectedId.set(id);
  }

  private revealVariableByKey(env: Environment, key: string): void {
    const variable = findEnabledEnvironmentVariableByKey(env.variables, key);
    if (!variable)
      return;
    const ancestors: string[] = [];
    let parentId = findEnvironmentLocation(env.variables, variable.id)?.parentId ?? null;
    while (parentId) {
      ancestors.push(parentId);
      parentId = findEnvironmentLocation(env.variables, parentId)?.parentId ?? null;
    }
    let next = env.variables;
    let expanded = false;
    for (const folderId of ancestors) {
      const folder = findEnvironmentFolder(next, folderId);
      if (!folder?.collapsed)
        continue;
      next = mapEnvironmentNodes(next, folderId, (node) =>
        isEnvironmentFolder(node) ? { ...node, collapsed: false } : node,
      );
      expanded = true;
    }
    if (expanded)
      this.environments.setVariables(env.id, next);
    if (this.query().trim())
      this.query.set('');
    this.selectAndFocus(variable.id);
    afterNextRender(
      () => {
        const row = this.host.nativeElement.querySelector(`[data-env-node-id="${variable.id}"]`);
        if (row instanceof HTMLElement)
          row.scrollIntoView({ block: 'nearest' });
      },
      { injector: this.injector },
    );
    this.focusSelector('#env-var-key');
  }

  private setPane(paneId: string | null): void {
    this.selectedId.set(paneId);
    const env = this.environment();
    if (env) {
      this.environments.setNodePane(env.id, paneId);
    }
  }

  private patchVariable(variable: EnvironmentVariable, patch: Partial<EnvironmentVariable>): void {
    const env = this.environment();
    if (!env) {
      return;
    }
    this.environments.setVariables(
      env.id,
      mapEnvironmentNodes(env.variables, variable.id, (node) =>
        isEnvironmentFolder(node) ? node : { ...node, description: readText(node.description), ...patch },
      ),
    );
  }

  private patchNode(id: string, update: (node: EnvironmentNode) => EnvironmentNode | null): void {
    const env = this.environment();
    if (!env) {
      return;
    }
    this.environments.setVariables(env.id, mapEnvironmentNodes(env.variables, id, update));
  }

  private focusSelector(selector: string): void {
    afterNextRender(
      () => {
        const match = this.host.nativeElement.querySelector(selector);
        const field =
          match instanceof HTMLInputElement || match instanceof HTMLTextAreaElement
            ? match
            : match instanceof HTMLElement
              ? match.querySelector('input, textarea')
              : null;
        if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLTextAreaElement)) {
          return;
        }
        field.focus();
        if (field instanceof HTMLInputElement) {
          field.select();
        }
      },
      { injector: this.injector },
    );
  }
}
