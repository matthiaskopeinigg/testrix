import { ChangeDetectionStrategy, Component, effect, input, output, signal, untracked, type AnimationCallbackEvent } from '@angular/core';
import { type FolderDocsMode } from '@testrix/contracts';
import { TxEmptyStateComponent } from '@testrix/ui';

import { runPaneEnter, runPaneLeave } from '../../core/pane-slide-anim';
import { docsModeSlideDir } from './docs-mode-slide';
import { FolderDocsPreviewComponent } from './folder-docs-preview.component';

/**
 * Shared Write / Split / Preview docs shell used by request, socket, folder-adjacent,
 * and service editors. Mode changes use Web Animations (same as regression/load sections)
 * so the slide works regardless of view encapsulation.
 */
@Component({
  selector: 'tx-docs-editor',
  standalone: true,
  imports: [TxEmptyStateComponent, FolderDocsPreviewComponent],
  templateUrl: './docs-editor.component.html',
  styleUrls: ['./docs-editor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocsEditorComponent {
  readonly value = input('');
  readonly mode = input<FolderDocsMode>('split');
  readonly ariaLabel = input('Docs');
  readonly emptyTitle = input('No docs yet');
  readonly emptyBody = input('Write markdown for this item.');
  readonly readonly = input(false);

  readonly valueChange = output<string>();
  readonly modeChange = output<FolderDocsMode>();

  readonly docsMode = signal<FolderDocsMode>('split');
  readonly docsSlideDir = signal<'left' | 'right' | null>(null);

  constructor() {
    effect(() => {
      const next = this.mode();
      // Only react to parent `[mode]` changes. Reading `docsMode` must stay untracked
      // or local Write/Preview clicks reset back to the unbound default (`split`).
      untracked(() => {
        if (next === this.docsMode())
          return;
        this.docsSlideDir.set(null);
        this.docsMode.set(next);
      });
    });
  }

  handleDocsMode(mode: FolderDocsMode): void {
    if (mode === this.docsMode())
      return;
    this.docsSlideDir.set(docsModeSlideDir(this.docsMode(), mode));
    this.docsMode.set(mode);
    this.modeChange.emit(mode);
  }

  handlePaneEnter(event: AnimationCallbackEvent): void {
    runPaneEnter(event, this.docsSlideDir());
  }

  handlePaneLeave(event: AnimationCallbackEvent): void {
    runPaneLeave(event, this.docsSlideDir());
  }

  handleDocsInput(event: Event): void {
    if (this.readonly())
      return;
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement))
      return;
    this.valueChange.emit(target.value);
  }
}
