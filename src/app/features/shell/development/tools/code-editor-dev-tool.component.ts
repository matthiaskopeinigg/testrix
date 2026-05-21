import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxCodeEditorComponent } from '@app/shared/components/tx-code-editor/tx-code-editor.component';
import {
  TX_CODE_EDITOR_LANGUAGES,
  txCodeEditorLanguageLabel,
  type TxCodeEditorLanguage,
} from '@app/shared/components/tx-code-editor/tx-code-editor-language';
import { TX_CODE_EDITOR_SAMPLES } from '@app/shared/components/tx-code-editor/tx-code-editor-samples';
import { tryFormatCodeEditorContent } from '@app/shared/components/tx-code-editor/tx-code-editor-format';
import { TxDropdownComponent } from '@app/shared/components/tx-dropdown/tx-dropdown.component';
import type { TxDropdownOption } from '@app/shared/components/tx-dropdown/tx-dropdown.types';
import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';

import { DevToolClipboardService } from '../shell/dev-tool-clipboard.service';
import { DevToolLayoutComponent } from '../shell/dev-tool-layout.component';
import { DevToolStatStripComponent } from '../shell/dev-tool-stat-strip.component';
import { DevToolToolbarComponent } from '../shell/dev-tool-toolbar.component';
import { createDevToolStateBinding } from './dev-tool-session.harness';

@Component({
  selector: 'app-code-editor-dev-tool',
  standalone: true,
  imports: [
    FormsModule,
    DevToolLayoutComponent,
    DevToolToolbarComponent,
    DevToolStatStripComponent,
    TxCodeEditorComponent,
    TxDropdownComponent,
    TxButtonComponent,
    TxTagComponent,
  ],
  templateUrl: './code-editor-dev-tool.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CodeEditorDevToolComponent {
  private readonly clipboard = inject(DevToolClipboardService);
  protected readonly state = createDevToolStateBinding('code-editor');

  protected readonly languageOptions: readonly TxDropdownOption[] = TX_CODE_EDITOR_LANGUAGES.map(
    (lang) => ({ value: lang, label: txCodeEditorLanguageLabel(lang) }),
  );

  protected readonly lineCount = computed(() => {
    const text = this.state().content;
    return text.length === 0 ? 0 : text.split('\n').length;
  });

  protected readonly charCount = computed(() => this.state().content.length);

  protected handleLanguageChange(value: string): void {
    if ((TX_CODE_EDITOR_LANGUAGES as readonly string[]).includes(value)) {
      this.state.update((s) => ({
        ...s,
        language: value as TxCodeEditorLanguage,
      }));
    }
  }

  protected handleLoadSample(): void {
    const lang = this.state().language;
    const sample = TX_CODE_EDITOR_SAMPLES[lang];
    this.state.update((s) => ({ ...s, content: sample }));
  }

  protected handleFormat(): void {
    const lang = this.state().language;
    const formatted = tryFormatCodeEditorContent(this.state().content, lang);
    if (formatted && formatted !== this.state().content) {
      this.state.update((s) => ({ ...s, content: formatted }));
    }
  }

  protected handleClear(): void {
    this.state.update((s) => ({ ...s, content: '' }));
  }

  protected async handleCopy(): Promise<void> {
    await this.clipboard.copy(this.state().content);
  }
}
