import { OverlayModule, type ConnectedPosition, type CdkOverlayOrigin } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { isDefaultWorkspace, workspaceDisplayName, type Workspace } from '@testrix/contracts';
import { lockOverlayWindowDrag, playLeaveThen, TxHintComponent, unlockOverlayWindowDrag } from '@testrix/ui';

import { SessionPersistenceService } from '../core/session-persistence.service';
import { ShellStateService } from '../core/shell-state.service';
import { WorkspacesStore } from '../features/workspaces/workspaces.store';

@Component({
  selector: 'tx-workspace-switcher',
  standalone: true,
  imports: [OverlayModule, TxHintComponent],
  templateUrl: './workspace-switcher.component.html',
  styleUrl: './workspace-switcher.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceSwitcherComponent {
  private readonly workspaces = inject(WorkspacesStore);
  private readonly session = inject(SessionPersistenceService);
  private readonly shell = inject(ShellStateService);

  readonly items = this.workspaces.items;
  readonly defaultWorkspace = computed(
    () => this.items().find((item) => isDefaultWorkspace(item)) ?? null,
  );
  readonly otherWorkspaces = computed(() => this.items().filter((item) => !isDefaultWorkspace(item)));
  readonly activeId = computed(() => this.workspaces.active()?.id ?? '');
  readonly activeName = computed(() => {
    const active = this.workspaces.active();
    return active ? this.workspaceLabel(active) : 'Workspace';
  });
  readonly managerOpen = this.shell.workspaceManagerOpen;
  readonly open = signal(false);
  private closing = false;
  readonly triggerWidth = signal(220);
  readonly listId = 'tx-workspace-switcher-list';

  readonly positions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
  ];

  constructor() {
    effect((onCleanup) => {
      if (!this.open())
        return;
      lockOverlayWindowDrag();
      onCleanup(unlockOverlayWindowDrag);
    });
  }

  handleToggle(origin: CdkOverlayOrigin): void {
    if (this.open()) {
      this.close();
      return;
    }
    const el = origin.elementRef.nativeElement as HTMLElement;
    this.triggerWidth.set(Math.max(240, Math.ceil(el.getBoundingClientRect().width)));
    this.closing = false;
    this.open.set(true);
  }

  handleOutside(): void {
    this.close();
  }

  handleKeydown(event: KeyboardEvent, origin: CdkOverlayOrigin): void {
    if (event.key === 'Escape' && this.open()) {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && !this.open()) {
      event.preventDefault();
      this.handleToggle(origin);
    }
  }

  handleManage(): void {
    this.close();
    this.shell.openWorkspaceManager();
  }

  async handleSelect(id: string): Promise<void> {
    this.close();
    const snapshot = await this.workspaces.switchTo(id);
    if (snapshot) {
      this.shell.playScene();
      this.session.applyActiveWorkspace();
    }
  }

  workspaceLabel(item: Workspace): string {
    return workspaceDisplayName(item);
  }

  private close(): void {
    if (!this.open() || this.closing)
      return;
    this.closing = true;
    const menu = document.getElementById(this.listId);
    playLeaveThen(menu instanceof HTMLElement ? menu : null, () => {
      this.closing = false;
      this.open.set(false);
    });
  }
}
