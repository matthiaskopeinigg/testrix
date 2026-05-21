import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxCodeEditorComponent } from '@app/shared/components/tx-code-editor/tx-code-editor.component';
import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';

import { DevToolClipboardService } from '../shell/dev-tool-clipboard.service';
import { DevToolLayoutComponent } from '../shell/dev-tool-layout.component';
import { DevToolModeChipComponent } from '../shell/dev-tool-mode-chip.component';
import { DevToolSectionsComponent } from '../shell/dev-tool-sections.component';
import { DevToolStatStripComponent } from '../shell/dev-tool-stat-strip.component';
import { DevToolToolbarComponent } from '../shell/dev-tool-toolbar.component';
import { createDevToolStateBinding } from './dev-tool-session.harness';
import {
  formatOpenApiContent,
  OPENAPI_PETSTORE_SAMPLE,
  parseOpenApiDocument,
} from './logic/openapi.logic';

@Component({
  selector: 'app-openapi-dev-tool',
  standalone: true,
  imports: [
    FormsModule,
    DevToolLayoutComponent,
    DevToolSectionsComponent,
    DevToolModeChipComponent,
    DevToolToolbarComponent,
    DevToolStatStripComponent,
    TxBannerComponent,
    TxButtonComponent,
    TxCodeEditorComponent,
    TxTagComponent,
  ],
  templateUrl: './openapi-dev-tool.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OpenApiDevToolComponent {
  private readonly clipboard = inject(DevToolClipboardService);
  protected readonly state = createDevToolStateBinding('openapi');

  protected readonly validation = computed(() =>
    parseOpenApiDocument(this.state().content, this.state().format),
  );

  protected readonly formatError = signal<string | null>(null);

  protected setSection(section: 'editor' | 'outline' | 'validate'): void {
    this.state.update((s) => ({ ...s, section }));
  }

  protected setFormat(format: 'json' | 'yaml'): void {
    this.state.update((s) => ({ ...s, format }));
  }

  protected handleParse(): void {
    void this.validation();
  }

  protected handleFormat(): void {
    const result = formatOpenApiContent(this.state().content, this.state().format);
    this.formatError.set(result.error);
    if (!result.error) {
      this.state.update((s) => ({ ...s, content: result.content }));
    }
  }

  protected handleImportPetstore(): void {
    this.state.update((s) => ({
      ...s,
      content: OPENAPI_PETSTORE_SAMPLE,
      format: 'json',
      section: 'editor',
    }));
  }

  protected handleClear(): void {
    this.state.update((s) => ({ ...s, content: '' }));
  }

  protected async handleCopy(): Promise<void> {
    await this.clipboard.copy(this.state().content);
  }
}
