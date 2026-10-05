import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { type FolderDocsMode } from '@testrix/contracts';
import { TxInputComponent, TxTagsInputComponent } from '@testrix/ui';

import { DocsEditorComponent } from '../../collections/docs-editor.component';

export interface LtDocsPatch {
  readonly docs?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
}

/**
 * Description, tags, and markdown docs for a load test (request-style Write/Split/Preview).
 */
@Component({
  selector: 'tx-lt-docs-panel',
  standalone: true,
  imports: [TxInputComponent, TxTagsInputComponent, DocsEditorComponent],
  templateUrl: './lt-docs-panel.component.html',
  styleUrl: './lt-docs-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LtDocsPanelComponent {
  readonly docs = input('');
  readonly description = input('');
  readonly tags = input<readonly string[]>([]);

  readonly patch = output<LtDocsPatch>();

  readonly docsMode = signal<FolderDocsMode>('split');

  handleDocs(value: string): void {
    this.patch.emit({ docs: value });
  }

  handleDescription(value: string): void {
    this.patch.emit({ description: value });
  }

  handleTags(tags: readonly string[]): void {
    this.patch.emit({ tags: [...tags] });
  }

  handleDocsMode(mode: FolderDocsMode): void {
    this.docsMode.set(mode);
  }
}
