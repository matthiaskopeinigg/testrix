import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  CODE_EDITOR_SHORTCUT_CATEGORY_LABELS,
  CODE_EDITOR_SHORTCUT_REFERENCE,
  formatCodeEditorShortcutKeys,
  type CodeEditorShortcutCategory,
  type EditorKeyboardSettings,
} from '@shared/config';

import { ElectronService } from '@app/core/electron/electron.service';

import { TxToggleComponent } from '../../tx-toggle/tx-toggle.component';

interface ShortcutGroup {
  readonly category: CodeEditorShortcutCategory;
  readonly title: string;
  readonly rows: readonly { readonly id: string; readonly label: string; readonly keys: string }[];
}

@Component({
  selector: 'tx-settings-editor-keyboard-section',
  standalone: true,
  imports: [FormsModule, TxToggleComponent],
  templateUrl: './tx-settings-editor-keyboard-section.component.html',
  styleUrl: './tx-settings-editor-keyboard-section.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxSettingsEditorKeyboardSectionComponent {
  private readonly electron = inject(ElectronService);

  readonly keyboard = input.required<EditorKeyboardSettings>();
  readonly keyboardChange = output<Partial<EditorKeyboardSettings>>();

  private readonly platform = computed(
    () => this.electron.bridge()?.platform ?? (typeof navigator !== 'undefined' ? navigator.platform : 'win32'),
  );

  protected readonly shortcutGroups = computed((): readonly ShortcutGroup[] => {
    const modPlatform = this.platform().toLowerCase().includes('mac') ? 'darwin' : 'win32';
    const format = (keys: string) => formatCodeEditorShortcutKeys(keys, modPlatform);
    const byCategory = new Map<CodeEditorShortcutCategory, { id: string; label: string; keys: string }[]>();
    for (const row of CODE_EDITOR_SHORTCUT_REFERENCE) {
      const list = byCategory.get(row.category) ?? [];
      list.push({ id: row.id, label: row.label, keys: format(row.keys) });
      byCategory.set(row.category, list);
    }
    const order: CodeEditorShortcutCategory[] = ['clipboard', 'editing', 'code'];
    return order
      .filter((cat) => byCategory.has(cat))
      .map((category) => ({
        category,
        title: CODE_EDITOR_SHORTCUT_CATEGORY_LABELS[category],
        rows: byCategory.get(category) ?? [],
      }));
  });

  protected emit(patch: Partial<EditorKeyboardSettings>): void {
    this.keyboardChange.emit(patch);
  }
}
