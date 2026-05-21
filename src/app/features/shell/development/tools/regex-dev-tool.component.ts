import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxDropdownComponent } from '@app/shared/components/tx-dropdown/tx-dropdown.component';
import type { TxDropdownOption } from '@app/shared/components/tx-dropdown/tx-dropdown.types';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';
import { TxTextareaComponent } from '@app/shared/components/tx-textarea/tx-textarea.component';
import { TxToggleComponent } from '@app/shared/components/tx-toggle/tx-toggle.component';

import { DevToolLayoutComponent } from '../shell/dev-tool-layout.component';
import { DevToolStatStripComponent } from '../shell/dev-tool-stat-strip.component';
import { DevToolToolbarComponent } from '../shell/dev-tool-toolbar.component';
import { createDevToolStateBinding } from './dev-tool-session.harness';
import { evaluateRegex, REGEX_CHEATSHEET, type RegexFlagSet } from './logic/regex.logic';

@Component({
  selector: 'app-regex-dev-tool',
  standalone: true,
  imports: [
    FormsModule,
    DevToolLayoutComponent,
    DevToolToolbarComponent,
    DevToolStatStripComponent,
    TxBannerComponent,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxInputComponent,
    TxTextareaComponent,
    TxToggleComponent,
    TxTagComponent,
    TxButtonComponent,
  ],
  templateUrl: './regex-dev-tool.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegexDevToolComponent {
  protected readonly state = createDevToolStateBinding('regex');

  protected readonly cheatsheetOptions: readonly TxDropdownOption[] = [
    { value: '', label: 'Cheatsheet…' },
    ...REGEX_CHEATSHEET.map((item) => ({ value: item.id, label: item.label })),
  ];

  protected readonly evalResult = computed(() => {
    const s = this.state();
    return evaluateRegex({
      pattern: s.pattern,
      flags: s.flags,
      sample: s.sample,
      replacement: s.replacement,
    });
  });

  protected setFlag(key: keyof RegexFlagSet, value: boolean): void {
    this.state.update((s) => ({
      ...s,
      flags: { ...s.flags, [key]: value },
    }));
  }

  protected handleCheatsheet(id: string): void {
    const item = REGEX_CHEATSHEET.find((c) => c.id === id);
    if (item) {
      this.state.update((s) => ({ ...s, pattern: item.pattern, cheatsheetId: id }));
    }
  }

  protected handleClear(): void {
    this.state.update((s) => ({
      ...s,
      pattern: '',
      sample: '',
      replacement: '',
    }));
  }
}
