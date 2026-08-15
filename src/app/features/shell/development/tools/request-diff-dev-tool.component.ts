import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { diffLines } from 'diff';

import { buildPairedDiffRows } from '@shared/http/diff-side-by-side';
import type { LineDiffHunk } from '@shared/http/response-diff';

import { TxButtonComponent } from '@app/shared/components/forms/tx-button/tx-button.component';
import { TxFormFieldComponent } from '@app/shared/components/forms/tx-form-field/tx-form-field.component';
import { TxTextareaComponent } from '@app/shared/components/forms/tx-textarea/tx-textarea.component';

import { DevToolClipboardService } from '../shell/dev-tool-clipboard.service';
import { DevToolLayoutComponent } from '../shell/dev-tool-layout.component';
import { DevToolToolbarComponent } from '../shell/dev-tool-toolbar.component';
import { createDevToolStateBinding } from './dev-tool-session.harness';

@Component({
  selector: 'app-request-diff-dev-tool',
  standalone: true,
  imports: [
    FormsModule,
    DevToolLayoutComponent,
    DevToolToolbarComponent,
    TxButtonComponent,
    TxFormFieldComponent,
    TxTextareaComponent,
  ],
  templateUrl: './request-diff-dev-tool.component.html',
  styleUrl: './request-diff-dev-tool.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestDiffDevToolComponent {
  private readonly clipboard = inject(DevToolClipboardService);
  protected readonly state = createDevToolStateBinding('request-diff');

  protected readonly hunks = computed((): readonly LineDiffHunk[] => {
    const parts = diffLines(this.state().left, this.state().right);
    return parts.flatMap((part) => {
      const lines = part.value.split('\n');
      if (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
      }
      const kind: LineDiffHunk['kind'] = part.added ? 'add' : part.removed ? 'remove' : 'unchanged';
      return lines.map((line) => ({ kind, line }));
    });
  });

  protected readonly paired = computed(() => buildPairedDiffRows(this.hunks()));

  protected async handleCopy(): Promise<void> {
    const text = this.hunks()
      .map((hunk) => `${hunk.kind === 'add' ? '+' : hunk.kind === 'remove' ? '-' : ' '} ${hunk.line}`)
      .join('\n');
    await this.clipboard.copy(text, 'Diff copied');
  }
}
