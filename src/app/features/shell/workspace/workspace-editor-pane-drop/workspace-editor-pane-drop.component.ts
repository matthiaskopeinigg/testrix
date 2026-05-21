import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  input,
  signal,
} from '@angular/core';

import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import {
  isWorkspaceTabDragEvent,
  readWorkspaceTabDragPayload,
  resolveWorkspaceEditorSplitZone,
  type WorkspaceEditorSplitZone,
} from '@app/core/workspace/workspace-tab-drag';
import { WorkspaceTabDragService } from '@app/core/workspace/workspace-tab-drag.service';

/** Human-readable label for each split edge (shown in the overlay). */
const ZONE_LABELS: Record<WorkspaceEditorSplitZone, string> = {
  left: 'Split left',
  right: 'Split right',
  top: 'Split up',
  bottom: 'Split down',
};

/**
 * Wraps editor pane content and accepts tab drags on edges to split.
 */
@Component({
  selector: 'app-workspace-editor-pane-drop',
  standalone: true,
  templateUrl: './workspace-editor-pane-drop.component.html',
  styleUrl: './workspace-editor-pane-drop.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'workspace-editor-pane-drop',
    '[class.workspace-editor-pane-drop--active]': 'dragActive()',
    '[attr.data-drop-zone]': 'activeZone()',
    '(dragover)': 'handleDragOver($event)',
    '(drop)': 'handleDrop($event)',
    '(dragleave)': 'handleDragLeave($event)',
  },
})
export class WorkspaceEditorPaneDropComponent {
  private readonly editor = inject(WorkspaceEditorService);
  private readonly tabDrag = inject(WorkspaceTabDragService);

  readonly groupId = input.required<string>();

  protected readonly dragActive = signal(false);
  protected readonly activeZone = signal<WorkspaceEditorSplitZone | null>(null);

  protected zoneLabel(): string {
    const zone = this.activeZone();
    return zone ? ZONE_LABELS[zone] : '';
  }

  @HostListener('document:dragend')
  protected handleDocumentDragEnd(): void {
    this.tabDrag.end();
    this.clearDragState();
  }

  protected handleDragOver(event: DragEvent): void {
    if (!isWorkspaceTabDragEvent(event.dataTransfer) && !this.tabDrag.payload()) {
      return;
    }

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const zone = resolveWorkspaceEditorSplitZone(rect, event.clientX, event.clientY);
    if (!zone) {
      this.dragActive.set(false);
      this.activeZone.set(null);
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }

    this.dragActive.set(true);
    this.activeZone.set(zone);
  }

  protected handleDragLeave(event: DragEvent): void {
    const related = event.relatedTarget as Node | null;
    const host = event.currentTarget as HTMLElement;
    if (related && host.contains(related)) {
      return;
    }
    this.clearDragState();
  }

  protected handleDrop(event: DragEvent): void {
    const payload =
      readWorkspaceTabDragPayload(event.dataTransfer) ?? this.tabDrag.payload();
    if (!payload) {
      this.clearDragState();
      return;
    }

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const zone = resolveWorkspaceEditorSplitZone(rect, event.clientX, event.clientY);
    if (!zone) {
      this.clearDragState();
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    this.editor.moveTabToSplitPane(
      payload.tabId,
      payload.fromGroupId,
      this.groupId(),
      zone,
    );
    this.tabDrag.end();
    this.clearDragState();
  }

  private clearDragState(): void {
    this.dragActive.set(false);
    this.activeZone.set(null);
  }
}
