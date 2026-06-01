import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  CODE_EDITOR_SHORTCUT_CATEGORY_LABELS,
  CODE_EDITOR_SHORTCUT_REFERENCE,
  formatCodeEditorShortcutKeys,
  type CodeEditorShortcutCategory,
  type EditorKeyboardSettings,
} from '@shared/config';

import { ElectronService } from '@app/core/electron/electron.service';
import {
  KEYBOARD_SHORTCUT_CATALOG,
  KEYBOARD_SHORTCUT_IDS,
  formatChordForDisplay,
} from '@app/core/keyboard/keyboard-shortcut-catalog';
import { serializeChordFromEvent, validateBindingMap } from '@app/core/keyboard/chord-matcher';

import { TxBannerComponent } from '../../tx-banner/tx-banner.component';
import { TxButtonComponent } from '../../tx-button/tx-button.component';
import { TxToggleComponent } from '../../tx-toggle/tx-toggle.component';

interface ShortcutGroup {
  readonly category: CodeEditorShortcutCategory;
  readonly title: string;
  readonly rows: readonly { readonly id: string; readonly label: string; readonly keys: string }[];
}

@Component({
  selector: 'tx-settings-editor-keyboard-section',
  standalone: true,
  imports: [FormsModule, TxToggleComponent, TxBannerComponent, TxButtonComponent],
  templateUrl: './tx-settings-editor-keyboard-section.component.html',
  styleUrl: './tx-settings-editor-keyboard-section.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxSettingsEditorKeyboardSectionComponent {
  private readonly electron = inject(ElectronService);
  private readonly destroyRef = inject(DestroyRef);

  readonly keyboard = input.required<EditorKeyboardSettings>();
  readonly appBindings = input<Record<string, string>>({});

  readonly keyboardChange = output<Partial<EditorKeyboardSettings>>();
  readonly appBindingsChange = output<Record<string, string>>();

  protected readonly bindCaptureActionId = signal<string | null>(null);
  protected readonly bindingError = signal<string | null>(null);

  private captureKeydownUnlisten: (() => void) | undefined;

  constructor() {
    this.destroyRef.onDestroy(() => this.endBindingCapture());
  }

  private readonly platform = computed(
    () => this.electron.bridge()?.platform ?? (typeof navigator !== 'undefined' ? navigator.platform : 'win32'),
  );

  protected readonly appShortcutRows = computed(() =>
    KEYBOARD_SHORTCUT_CATALOG.filter((entry) => entry.scope === 'global').map((entry) => ({
      ...entry,
      chord: this.displayChordFor(entry.id, entry.defaultChord),
    })),
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

  protected formatAppChord(chord: string): string {
    return formatChordForDisplay(chord, this.platform());
  }

  protected isCapturing(actionId: string): boolean {
    return this.bindCaptureActionId() === actionId;
  }

  protected handleStartCapture(actionId: string): void {
    this.endBindingCapture();
    this.bindCaptureActionId.set(actionId);
    this.bindingError.set(null);
    const handler = (ev: KeyboardEvent) => this.onBindingCaptureKeydown(ev);
    window.addEventListener('keydown', handler, true);
    this.captureKeydownUnlisten = () => window.removeEventListener('keydown', handler, true);
  }

  protected handleResetBinding(actionId: string): void {
    const next = { ...this.appBindings() };
    delete next[actionId];
    this.bindingError.set(null);
    this.appBindingsChange.emit(this.pruneEmptyBindings(next));
  }

  protected handleResetAllBindings(): void {
    this.bindingError.set(null);
    this.appBindingsChange.emit({});
  }

  private displayChordFor(actionId: string, defaultChord: string): string {
    const override = this.appBindings()[actionId];
    return (override && override.trim()) || defaultChord;
  }

  private onBindingCaptureKeydown(ev: KeyboardEvent): void {
    const actionId = this.bindCaptureActionId();
    if (!actionId) return;

    if (ev.key === 'Escape') {
      ev.preventDefault();
      this.endBindingCapture();
      return;
    }

    if (ev.repeat) return;

    const chord = serializeChordFromEvent(ev);
    if (!chord.includes('+') && !/^F\d+$/.test(chord)) {
      return;
    }

    ev.preventDefault();
    ev.stopPropagation();

    const tentative: Record<string, string> = { ...this.appBindings(), [actionId]: chord };
    const check = validateBindingMap(tentative, KEYBOARD_SHORTCUT_IDS);
    if (!check.ok) {
      this.bindingError.set(check.message);
      this.endBindingCapture();
      return;
    }

    this.bindingError.set(null);
    this.endBindingCapture();
    this.appBindingsChange.emit(this.pruneEmptyBindings(tentative));
  }

  private endBindingCapture(): void {
    this.bindCaptureActionId.set(null);
    this.captureKeydownUnlisten?.();
    this.captureKeydownUnlisten = undefined;
  }

  private pruneEmptyBindings(bindings: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(bindings)) {
      if (value?.trim()) out[key] = value.trim();
    }
    return out;
  }
}
