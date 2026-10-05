import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { CodeEditorLanguage } from './code-editor-language';
import { highlightCode } from './code-highlight';

@Component({
  selector: 'tx-code-highlight',
  standalone: true,
  templateUrl: './code-highlight.component.html',
  styleUrl: './code-highlight.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-language]': 'language()',
    '[attr.aria-label]': 'ariaLabel()',
    role: 'textbox',
    'aria-readonly': 'true',
    tabindex: '0',
  },
})
export class CodeHighlightComponent {
  readonly value = input('');
  readonly language = input<CodeEditorLanguage>('text');
  readonly ariaLabel = input('Code');

  readonly tokens = computed(() => highlightCode(this.value(), this.language()));
}
