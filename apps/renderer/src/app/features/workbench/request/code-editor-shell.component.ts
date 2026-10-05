import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  ViewContainerRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import type { CodeEditorLanguage } from './code-editor-language';

@Component({
  selector: 'tx-code-editor',
  standalone: true,
  templateUrl: './code-editor-shell.component.html',
  styleUrl: './code-editor-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CodeEditorShellComponent {
  readonly value = input('');
  readonly language = input<CodeEditorLanguage>('text');
  readonly readonly = input(false);
  readonly ariaLabel = input('Code editor');
  readonly variables = input<readonly string[]>([]);
  readonly wrap = input(false);
  readonly lint = input(true);
  readonly complete = input(true);
  readonly placeholders = input(true);
  readonly valueChange = output<string>();

  private readonly slot = viewChild('slot', { read: ViewContainerRef });
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly inner = signal<{ format(): boolean; setInput(name: string, value: unknown): void } | null>(null);

  constructor() {
    afterNextRender(() => {
      void this.mount();
    });
    this.destroyRef.onDestroy(() => this.inner.set(null));
    effect(() => {
      const editor = this.inner();
      if (!editor)
        return;
      editor.setInput('value', this.value());
      editor.setInput('language', this.language());
      editor.setInput('readonly', this.readonly());
      editor.setInput('ariaLabel', this.ariaLabel());
      editor.setInput('variables', this.variables());
      editor.setInput('wrap', this.wrap());
      editor.setInput('lint', this.lint());
      editor.setInput('complete', this.complete());
      editor.setInput('placeholders', this.placeholders());
    });
  }

  format(): boolean {
    return this.inner()?.format() ?? false;
  }

  private async mount(): Promise<void> {
    const slot = this.slot();
    if (!slot || this.inner())
      return;
    const { CodeEditorComponent } = await import('./code-editor.component');
    const ref = slot.createComponent(CodeEditorComponent, { injector: this.injector });
    const sub = ref.instance.valueChange.subscribe((value) => this.valueChange.emit(value));
    this.destroyRef.onDestroy(() => {
      sub.unsubscribe();
      ref.destroy();
    });
    this.inner.set({
      format: () => ref.instance.format(),
      setInput: (name, value) => ref.setInput(name, value),
    });
  }
}
