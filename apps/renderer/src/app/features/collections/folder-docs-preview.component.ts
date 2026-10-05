import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { parseMarkdown, type MarkdownBlock, type MarkdownInline } from '@testrix/contracts';

@Component({
  selector: 'tx-folder-docs-preview',
  standalone: true,
  imports: [NgTemplateOutlet],
  templateUrl: './folder-docs-preview.component.html',
  styleUrl: './folder-docs-preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FolderDocsPreviewComponent {
  readonly source = input('');

  readonly blocks = computed(() => parseMarkdown(this.source()));

  trackBlock(index: number, block: MarkdownBlock): string {
    return `${block.kind}-${index}`;
  }

  trackInline(index: number, part: MarkdownInline): string {
    return `${part.kind}-${index}`;
  }
}
