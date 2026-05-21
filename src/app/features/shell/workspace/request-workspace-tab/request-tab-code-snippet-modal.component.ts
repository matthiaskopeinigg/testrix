import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  generateRequestCodeSnippet,
  REQUEST_CODE_SNIPPET_FORMATS,
  type RequestCodeSnippetFormatId,
  type RequestCodeSnippetInput,
} from '@shared/config';

import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxCodeEditorComponent } from '@app/shared/components/tx-code-editor/tx-code-editor.component';
import type { TxCodeEditorLanguage } from '@app/shared/components/tx-code-editor/tx-code-editor-language';
import { TxDropdownComponent } from '@app/shared/components/tx-dropdown/tx-dropdown.component';
import type { TxDropdownOption } from '@app/shared/components/tx-dropdown/tx-dropdown.types';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxModalComponent } from '@app/shared/components/tx-modal/tx-modal.component';
import { TxNotificationService } from '@app/core/notifications/tx-notification.service';

const FORMAT_OPTIONS: readonly TxDropdownOption[] = REQUEST_CODE_SNIPPET_FORMATS.map(
  (format) => ({
    value: format.id,
    label: format.label,
  }),
);

@Component({
  selector: 'app-request-tab-code-snippet-modal',
  standalone: true,
  imports: [
    FormsModule,
    TxModalComponent,
    TxFormFieldComponent,
    TxDropdownComponent,
    TxCodeEditorComponent,
    TxButtonComponent,
    TxIconComponent,
  ],
  templateUrl: './request-tab-code-snippet-modal.component.html',
  styleUrl: './request-tab-code-snippet-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestTabCodeSnippetModalComponent {
  private readonly notifications = inject(TxNotificationService);

  readonly open = input(false);
  readonly snippetInput = input<RequestCodeSnippetInput | null>(null);

  readonly closed = output<void>();

  protected readonly formatOptions = FORMAT_OPTIONS;
  protected readonly formatId = signal<RequestCodeSnippetFormatId>('curl');
  protected readonly copyState = signal<'idle' | 'copied'>('idle');

  protected readonly snippetText = computed(() => {
    const input = this.snippetInput();
    if (!input) {
      return '// No request data available.';
    }
    return generateRequestCodeSnippet(input, this.formatId());
  });

  protected readonly editorLanguage = computed((): TxCodeEditorLanguage => {
    const format = REQUEST_CODE_SNIPPET_FORMATS.find((entry) => entry.id === this.formatId());
    const lang = format?.editorLanguage ?? 'text';
    return lang === 'js' ? 'js' : 'html';
  });

  protected readonly editorBadge = computed(
    () => REQUEST_CODE_SNIPPET_FORMATS.find((entry) => entry.id === this.formatId())?.label ?? 'Code',
  );

  protected handleFormatChange(value: string | null): void {
    if (!value) {
      return;
    }
    this.formatId.set(value as RequestCodeSnippetFormatId);
  }

  protected handleClose(): void {
    this.closed.emit();
  }

  protected async handleCopy(): Promise<void> {
    const text = this.snippetText();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error('Clipboard unavailable');
      }
      this.copyState.set('copied');
      this.notifications.showSuccess('Copied to clipboard');
      setTimeout(() => this.copyState.set('idle'), 2000);
    } catch {
      this.notifications.showError('Could not copy to clipboard');
    }
  }
}
