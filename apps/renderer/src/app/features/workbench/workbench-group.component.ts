import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, linkedSignal, output, signal } from '@angular/core';

import { WorkbenchPanelComponent } from './workbench-panel.component';
import { WorkbenchTablistComponent } from './workbench-tablist.component';
import type { WorkbenchGroup, WorkbenchTab } from './workbench.store';

type WorkbenchSlideDir = 'left' | 'right' | 'open';

interface WorkbenchSlideSource {
  readonly id: string | null;
  readonly tabs: readonly WorkbenchTab[];
  readonly justOpenedId: string | null;
}

@Component({
  selector: 'tx-workbench-group',
  standalone: true,
  imports: [WorkbenchTablistComponent, WorkbenchPanelComponent],
  templateUrl: './workbench-group.component.html',
  styleUrl: './workbench-group.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkbenchGroupComponent {
  private readonly destroyRef = inject(DestroyRef);
  readonly group = input.required<WorkbenchGroup>();
  readonly listId = input.required<string>();
  readonly connectedTo = input<string[]>([]);
  readonly focused = input(false);
  readonly justOpenedId = input<string | null>(null);

  readonly select = output<string>();
  readonly close = output<string>();
  readonly reorder = output<{ previousIndex: number; currentIndex: number }>();
  readonly transfer = output<{
    previousIndex: number;
    currentIndex: number;
    previousContainerId: string;
    containerId: string;
  }>();
  readonly focusGroup = output<void>();
  readonly dragStart = output<void>();
  readonly dragEnd = output<void>();

  private readonly motionLocked = signal(false);
  private unlockTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.unlockTimer)
        clearTimeout(this.unlockTimer);
    });
  }

  readonly activeTab = computed((): WorkbenchTab | null => {
    const group = this.group();
    if (!group.activeTabId) {
      return null;
    }
    return group.tabs.find((tab) => tab.id === group.activeTabId) ?? null;
  });

  readonly slideDir = linkedSignal<WorkbenchSlideSource, WorkbenchSlideDir | null>({
    source: () => ({
      id: this.activeTab()?.id ?? null,
      tabs: this.group().tabs,
      justOpenedId: this.justOpenedId(),
    }),
    computation: (next, previous) => {
      const prevId = previous?.source.id ?? null;
      if (next.id === prevId)
        return previous?.value ?? null;
      if (!prevId)
        return 'open';
      if (!next.id)
        return null;
      if (next.justOpenedId === next.id)
        return 'open';
      if (this.motionLocked())
        return null;
      const prevIndex = next.tabs.findIndex((tab) => tab.id === prevId);
      const nextIndex = next.tabs.findIndex((tab) => tab.id === next.id);
      if (prevIndex >= 0 && nextIndex >= 0 && nextIndex !== prevIndex)
        return nextIndex > prevIndex ? 'right' : 'left';
      return 'open';
    },
  });

  readonly swapNonce = linkedSignal<string | null, number>({
    source: () => this.activeTab()?.id ?? null,
    computation: (id, previous) => {
      if (!previous || previous.source === id)
        return previous?.value ?? 0;
      return previous.value + 1;
    },
  });

  handlePanelAnimationStart(event: AnimationEvent): void {
    if (event.target !== event.currentTarget)
      return;
    this.motionLocked.set(true);
    this.armUnlock();
  }

  handlePanelAnimationEnd(event: AnimationEvent): void {
    if (event.target !== event.currentTarget)
      return;
    this.unlockMotion();
  }

  private armUnlock(): void {
    if (this.unlockTimer)
      clearTimeout(this.unlockTimer);
    this.unlockTimer = setTimeout(() => this.unlockMotion(), 400);
  }

  private unlockMotion(): void {
    if (this.unlockTimer) {
      clearTimeout(this.unlockTimer);
      this.unlockTimer = null;
    }
    this.motionLocked.set(false);
  }
}
