import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { CollectionFolderScriptPaneId, CollectionFolderScripts } from '@shared/config';
import type { DynamicVariableCatalogItem } from '@shared/dynamic-variables';

import { TxCodeEditorComponent } from '@app/shared/components/tx-code-editor/tx-code-editor.component';
import type { TxCodeEditorCompletionItem } from '@app/shared/components/tx-code-editor/tx-code-editor-completion';

const SCRIPT_EDITOR_PLACEHOLDER = `// Postman-style script APIs (Ctrl+Space for suggestions)
// pm.variables — script cache for the current run
// pm.environment — active environment variables
// pm.collectionVariables — collection-scoped variables`;

@Component({
  selector: 'app-request-tab-scripts-panel',
  standalone: true,
  imports: [FormsModule, TxCodeEditorComponent],
  template: `
    <div class="request-panel request-panel--script">
      <h2 class="request-panel__title">Scripts</h2>
      <p class="request-panel__hint">JavaScript run before the request or after the response.</p>
      <div class="request-panel__script-nav" role="tablist" aria-label="Script timing">
        <button
          type="button"
          class="request-panel__script-tab"
          role="tab"
          [attr.aria-selected]="activePane() === 'pre'"
          [class.is-active]="activePane() === 'pre'"
          (click)="activePaneChange.emit('pre')"
        >
          Pre-request
        </button>
        <button
          type="button"
          class="request-panel__script-tab"
          role="tab"
          [attr.aria-selected]="activePane() === 'post'"
          [class.is-active]="activePane() === 'post'"
          (click)="activePaneChange.emit('post')"
        >
          Post-response
        </button>
      </div>
      <div class="request-panel__editor">
        <tx-code-editor
          language="js"
          languageBadgeLabel="Javascript"
          [placeholder]="placeholder"
          [hideToolbarActions]="true"
          [framed]="false"
          [extraCompletionItems]="completionItems()"
          [variableCatalog]="variableCatalog()"
          [ngModel]="activeSource()"
          (ngModelChange)="handleScriptChange($event)"
        />
      </div>
    </div>
  `,
  styleUrl: './request-tab-panels.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestTabScriptsPanelComponent {
  readonly scripts = input.required<CollectionFolderScripts>();
  readonly activePane = input<CollectionFolderScriptPaneId>('pre');
  readonly completionItems = input<readonly TxCodeEditorCompletionItem[]>([]);
  readonly variableCatalog = input<readonly DynamicVariableCatalogItem[]>([]);

  readonly scriptsChange = output<CollectionFolderScripts>();
  readonly activePaneChange = output<CollectionFolderScriptPaneId>();

  protected readonly placeholder = SCRIPT_EDITOR_PLACEHOLDER;

  protected readonly activeSource = computed(() => {
    const scripts = this.scripts();
    return this.activePane() === 'pre' ? scripts.pre : scripts.post;
  });

  protected handleScriptChange(source: string): void {
    const scripts: CollectionFolderScripts = { ...this.scripts() };
    if (this.activePane() === 'pre') {
      scripts.pre = source;
    } else {
      scripts.post = source;
    }
    this.scriptsChange.emit(scripts);
  }
}
