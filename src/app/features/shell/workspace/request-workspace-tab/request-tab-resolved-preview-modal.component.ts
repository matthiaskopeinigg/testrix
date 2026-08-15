import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { TxButtonComponent } from '@app/shared/components/forms/tx-button/tx-button.component';
import { TxCodeEditorComponent } from '@app/shared/components/editors/tx-code-editor/tx-code-editor.component';
import { TxIconComponent } from '@app/shared/components/forms/tx-icon/tx-icon.component';
import { TxModalComponent } from '@app/shared/components/overlays/tx-modal/tx-modal.component';
import { TxNotificationService } from '@app/core/notifications/tx-notification.service';

@Component({
  selector: 'app-request-tab-resolved-preview-modal',
  standalone: true,
  imports: [FormsModule, TxModalComponent, TxCodeEditorComponent, TxButtonComponent, TxIconComponent],
  templateUrl: './request-tab-resolved-preview-modal.component.html',
  styleUrl: './request-tab-code-snippet-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestTabResolvedPreviewModalComponent {
  private readonly notifications = inject(TxNotificationService);

  readonly open = input(false);
  readonly previewText = input<string | null>(null);

  readonly closed = output<void>();

  protected readonly editorText = computed(
    () => this.previewText() ?? '// Request could not be resolved. Check URL, auth, and variables.',
  );

  protected handleClose(): void {
    this.closed.emit();
  }

  protected async handleCopy(): Promise<void> {
    const text = this.editorText();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error('Clipboard unavailable');
      }
      this.notifications.showSuccess('Copied to clipboard');
    } catch {
      this.notifications.showError('Could not copy to clipboard');
    }
  }
}
