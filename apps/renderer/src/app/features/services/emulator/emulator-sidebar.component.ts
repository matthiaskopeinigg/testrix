import { type GlobalPositionStrategy, Overlay, type OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  viewChild,
  ViewContainerRef,
  type TemplateRef,
} from '@angular/core';
import {
  createEmulatorDevice,
  emptyAndroidToolchainStatus,
  isAvdEmulatorDevice,
  type AndroidToolchainStatus,
  type EmulatorDeviceRecord,
} from '@testrix/contracts';
import {
  TxDraggableDirective,
  TxEmptyStateComponent,
  TxHintComponent,
  playLeaveThen,
  type TxDragEndEvent,
  type TxDragMoveEvent,
  type TxDragStartEvent,
} from '@testrix/ui';

import { ConfirmDialogService } from '../../../core/confirm-dialog.service';
import { DesktopApiService } from '../../../core/desktop-api.service';
import {
  applyPointerSelect,
  emptySelection,
  isRangeModifier,
  isToggleModifier,
  shouldKeepPointerSelection,
} from '../../../core/range-select';
import {
  isEditableKeyboardTarget,
  isModKey,
  shouldDeferToFlowCanvas,
} from '../../../core/selection-hotkeys';
import { WorkbenchStore } from '../../workbench/workbench.store';
import { EmulatorDndService } from './emulator-dnd.service';

type SideMenu =
  | { readonly kind: 'devices-root' }
  | { readonly kind: 'device'; readonly device: EmulatorDeviceRecord };

@Component({
  selector: 'tx-emulator-sidebar',
  standalone: true,
  imports: [TxDraggableDirective, TxEmptyStateComponent, TxHintComponent],
  providers: [EmulatorDndService],
  templateUrl: './emulator-sidebar.component.html',
  styleUrl: './emulator-sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmulatorSidebarComponent {
  readonly desktop = inject(DesktopApiService);
  readonly dnd = inject(EmulatorDndService);
  private readonly workbench = inject(WorkbenchStore);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly overlay = inject(Overlay);
  private readonly vcr = inject(ViewContainerRef);
  private readonly rootRef = viewChild<ElementRef<HTMLElement>>('root');
  private readonly scrollerRef = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly menuTemplate = viewChild.required<TemplateRef<unknown>>('emulatorMenu');

  readonly status = signal<AndroidToolchainStatus>(emptyAndroidToolchainStatus());
  readonly busy = signal(false);
  readonly menu = signal<SideMenu | null>(null);
  readonly selectedIds = signal<readonly string[]>([]);
  readonly selectionAnchorId = signal<string | null>(null);

  readonly devices = computed(() => this.desktop.emulator().devices);
  readonly activeDeviceId = computed(() => this.desktop.emulator().selectedDeviceId);
  readonly canStartDevice = computed(() => !this.busy() && !this.status().busy);
  readonly canColdBoot = computed(() => !this.busy() && !this.status().busy);
  readonly deleteLabel = computed(() => {
    const menu = this.menu();
    const selected = this.selectedIds();
    if (menu?.kind === 'device' && selected.includes(menu.device.id) && selected.length > 1)
      return 'Delete selected';
    return 'Delete';
  });

  private overlayRef: OverlayRef | null = null;
  private menuCloseToken = 0;

  constructor() {
    void this.refreshLive();
    const off = this.desktop.api.services.onDeviceEvent(() => {
      void this.refresh();
    });
    const timer = setInterval(() => void this.refreshLive(), 4_000);
    effect(() => {
      this.dnd.registerSurface(
        this.rootRef()?.nativeElement ?? null,
        this.scrollerRef()?.nativeElement ?? null,
      );
    });
    inject(DestroyRef).onDestroy(() => {
      off();
      clearInterval(timer);
      this.closeMenu(true);
    });
  }

  async refresh(): Promise<void> {
    this.status.set(await this.desktop.api.services.device.status());
    this.desktop.emulator.set(await this.desktop.api.services.emulator.get());
    this.pruneSelection();
  }

  async refreshLive(): Promise<void> {
    this.status.set(await this.desktop.api.services.device.refresh());
    this.desktop.emulator.set(await this.desktop.api.services.emulator.get());
    this.pruneSelection();
  }

  isSelected(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  isJustMoved(id: string): boolean {
    return this.dnd.lastMovedId() === id;
  }

  isDragging(id: string): boolean {
    return this.dnd.dragIds().includes(id);
  }

  isAvdDevice(device: EmulatorDeviceRecord): boolean {
    return isAvdEmulatorDevice(device);
  }

  dragCount(): number {
    return this.dnd.dragIds().length;
  }

  openDevicesRootMenu(event: MouseEvent): void {
    if (event.target instanceof Element && event.target.closest('[data-device-id]'))
      return;
    this.openMenu(event, { kind: 'devices-root' });
  }

  handleChromeClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element) || target.closest('[data-device-id], button, tx-hint'))
      return;
    this.clearSelection();
  }

  async addDevice(): Promise<void> {
    this.closeMenu(true);
    const taken = new Set(this.devices().map((item) => item.name));
    let name = 'Device';
    let index = 2;
    while (taken.has(name)) {
      name = `Device ${index}`;
      index += 1;
    }
    const device = createEmulatorDevice('pixel_6', name);
    const next = [...this.devices(), device];
    await this.desktop.saveEmulator({ devices: next, selectedDeviceId: device.id });
    this.selectedIds.set([device.id]);
    this.selectionAnchorId.set(device.id);
    this.workbench.openFromEmulatorDevice(device);
  }

  handleSelect(
    device: EmulatorDeviceRecord,
    event: { readonly shiftKey: boolean; readonly ctrlKey: boolean; readonly metaKey: boolean },
  ): void {
    if (
      shouldKeepPointerSelection({
        event,
        selectedIds: this.selectedIds(),
        targetId: device.id,
      })
    )
      return;

    const next = applyPointerSelect({
      event,
      visibleIds: this.devices().map((item) => item.id),
      selectedIds: this.selectedIds(),
      anchorId: this.selectionAnchorId(),
      targetId: device.id,
    });
    this.selectedIds.set(next.ids);
    this.selectionAnchorId.set(next.anchorId);

    if (isRangeModifier(event) || isToggleModifier(event))
      return;

    void this.desktop.saveEmulator({ selectedDeviceId: device.id });
    this.closeMenu(true);
    this.workbench.openFromEmulatorDevice(device);
  }

  handleRowKeydown(device: EmulatorDeviceRecord, event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.handleSelect(device, event);
      return;
    }
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      this.dnd.reorder(device.id, event.key === 'ArrowUp' ? -1 : 1, this.selectedIds());
    }
  }

  start(device: EmulatorDeviceRecord, coldBoot = false): void {
    this.closeMenu(true);
    if (this.busy() || this.status().busy)
      return;
    void this.desktop.saveEmulator({ selectedDeviceId: device.id });
    this.selectedIds.set([device.id]);
    this.selectionAnchorId.set(device.id);
    this.workbench.requestEmulatorBoot(device, coldBoot);
  }

  async stop(): Promise<void> {
    this.closeMenu(true);
    this.busy.set(true);
    try {
      this.status.set((await this.desktop.api.services.device.stopEmulator()).status);
    } finally {
      this.busy.set(false);
    }
  }

  openDeviceMenu(device: EmulatorDeviceRecord, event: MouseEvent): void {
    if (!this.selectedIds().includes(device.id)) {
      this.selectedIds.set([device.id]);
      this.selectionAnchorId.set(device.id);
    }
    void this.desktop.saveEmulator({ selectedDeviceId: device.id });
    this.openMenu(event, { kind: 'device', device });
  }

  async removeFromMenu(): Promise<void> {
    const menu = this.menu();
    this.closeMenu(true);
    if (menu?.kind !== 'device')
      return;
    const selected = this.selectedIds();
    const ids =
      selected.includes(menu.device.id) && selected.length > 1 ? [...selected] : [menu.device.id];
    await this.deleteIds(ids);
  }

  handleDragStarted(event: TxDragStartEvent<EmulatorDeviceRecord>): void {
    const selected = this.selectedIds();
    const ids =
      selected.includes(event.payload.id) && selected.length > 1
        ? this.devices()
            .map((item) => item.id)
            .filter((id) => selected.includes(id))
        : [event.payload.id];
    if (!selected.includes(event.payload.id)) {
      this.selectedIds.set([event.payload.id]);
      this.selectionAnchorId.set(event.payload.id);
    }
    this.dnd.begin(event.payload, ids);
  }

  handleDragMoved(event: TxDragMoveEvent<EmulatorDeviceRecord>): void {
    this.dnd.move(event.point);
  }

  handleDragEnded(event: TxDragEndEvent<EmulatorDeviceRecord>): void {
    this.dnd.end(event.reason, event.releaseRect);
  }

  handleListKeydown(event: KeyboardEvent): void {
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      const focused = (event.target instanceof Element ? event.target : null)?.closest('[data-device-id]');
      const focusedId = focused?.getAttribute('data-device-id');
      if (!focusedId)
        return;
      event.preventDefault();
      this.dnd.reorder(focusedId, event.key === 'ArrowUp' ? -1 : 1, this.selectedIds());
      return;
    }

    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')
      return;
    if (event.altKey)
      return;
    const items = this.devices();
    if (items.length === 0)
      return;

    const focused = (event.target instanceof Element ? event.target : null)?.closest('[data-device-id]');
    const focusedId = focused?.getAttribute('data-device-id');
    const index = Math.max(
      0,
      items.findIndex((item) => item.id === focusedId),
    );
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = Math.min(items.length - 1, Math.max(0, index + delta));
    const next = items[nextIndex];
    if (!next || next.id === focusedId)
      return;

    event.preventDefault();
    const row = (event.currentTarget as HTMLElement | null)?.querySelector(
      `[data-device-id="${next.id}"] [role="option"]`,
    );
    if (row instanceof HTMLElement)
      row.focus();
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

  @HostListener('window:resize')
  handleWindowResize(): void {
    this.closeMenu(true);
  }

  @HostListener('document:keydown', ['$event'])
  handleDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (this.menu()) {
        event.preventDefault();
        this.closeMenu();
        return;
      }
      if (this.selectedIds().length > 0) {
        event.preventDefault();
        this.clearSelection();
      }
      return;
    }

    if (this.menu())
      return;
    if (isEditableKeyboardTarget(event.target))
      return;
    if (shouldDeferToFlowCanvas(event))
      return;

    if (event.key === 'Delete' || event.key === 'Backspace') {
      const ids = [...this.selectedIds()];
      if (ids.length === 0)
        return;
      event.preventDefault();
      void this.deleteIds(ids);
      return;
    }

    if (isModKey(event, 'a')) {
      const ids = this.devices().map((item) => item.id);
      if (ids.length === 0)
        return;
      event.preventDefault();
      this.selectedIds.set(ids);
      this.selectionAnchorId.set(ids[0] ?? null);
    }
  }

  private async deleteIds(ids: readonly string[]): Promise<void> {
    if (ids.length === 0)
      return;
    const devices = this.devices();
    const removable = ids.filter((id) => {
      const device = devices.find((item) => item.id === id);
      return device && !isAvdEmulatorDevice(device);
    });
    if (removable.length === 0) {
      this.closeMenu(true);
      return;
    }
    const names = removable
      .map((id) => devices.find((item) => item.id === id)?.name.trim() || 'Device')
      .slice(0, 3);
    const extra = removable.length > 3 ? ` and ${removable.length - 3} more` : '';
    const ok = await this.confirm.ask({
      title: removable.length === 1 ? 'Delete device' : 'Delete devices',
      body:
        removable.length === 1
          ? `This removes ${names[0]} from the Devices sidebar.`
          : `This removes ${names.join(', ')}${extra} from the Devices sidebar.`,
      confirmLabel: 'Delete',
    });
    if (!ok)
      return;

    const removing = new Set(removable);
    const next = devices.filter((item) => !removing.has(item.id));
    const active = this.activeDeviceId();
    const selectedDeviceId = active && removing.has(active) ? (next[0]?.id ?? null) : active;
    await this.desktop.saveEmulator({ devices: next, selectedDeviceId });
    this.workbench.closeEmulatorDeviceTabs(removable);
    this.selectedIds.set(this.selectedIds().filter((id) => !removing.has(id)));
    if (this.selectionAnchorId() && removing.has(this.selectionAnchorId()!))
      this.selectionAnchorId.set(this.selectedIds()[0] ?? null);
  }

  private clearSelection(): void {
    const next = emptySelection();
    this.selectedIds.set(next.ids);
    this.selectionAnchorId.set(next.anchorId);
  }

  private pruneSelection(): void {
    const valid = new Set(this.devices().map((item) => item.id));
    const next = this.selectedIds().filter((id) => valid.has(id));
    if (next.length !== this.selectedIds().length)
      this.selectedIds.set(next);
    const anchor = this.selectionAnchorId();
    if (anchor && !valid.has(anchor))
      this.selectionAnchorId.set(next[0] ?? null);
  }

  private openMenu(event: MouseEvent, next: SideMenu): void {
    event.preventDefault();
    event.stopPropagation();
    this.closeMenu(true);
    this.menu.set(next);
    const x = event.clientX;
    const y = event.clientY;
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
      if (this.overlayRef === overlayRef)
        this.placeMenu(overlayRef, position, x, y);
    });
    window.setTimeout(() => {
      if (this.overlayRef !== overlayRef)
        return;
      overlayRef.outsidePointerEvents().subscribe(() => this.closeMenu());
    });
  }

  private placeMenu(overlayRef: OverlayRef, position: GlobalPositionStrategy, x: number, y: number): void {
    const menu = overlayRef.overlayElement.querySelector('.tx-emulator-side__menu');
    const width = menu instanceof HTMLElement && menu.offsetWidth ? menu.offsetWidth : 200;
    const height = menu instanceof HTMLElement && menu.offsetHeight ? menu.offsetHeight : 160;
    const margin = 8;
    const left = x + width > window.innerWidth - margin ? Math.max(margin, x - width) : x;
    const top = y + height > window.innerHeight - margin ? Math.max(margin, y - height) : y;
    position.left(`${left}px`).top(`${top}px`);
    overlayRef.updatePosition();
  }
}
