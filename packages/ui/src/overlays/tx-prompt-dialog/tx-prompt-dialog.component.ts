import { afterNextRender, booleanAttribute, ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, output, signal } from '@angular/core';

import { TxButtonComponent } from '../../primitives/tx-button/tx-button.component';
import { TxInputComponent } from '../../primitives/tx-input/tx-input.component';
import { TxOverlayHostDirective } from '../tx-overlay-host.directive';
import { TxOverlayComponent } from '../tx-overlay/tx-overlay.component';

let promptUid = 0;

@Component({
  selector: 'tx-prompt-dialog',
  standalone: true,
  imports: [TxOverlayComponent, TxButtonComponent, TxInputComponent],
  templateUrl: './tx-prompt-dialog.component.html',
  styleUrl: './tx-prompt-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [TxOverlayHostDirective],
})
export class TxPromptDialogComponent {
  readonly title = input.required<string>();
  readonly body = input.required<string>();
  readonly confirmLabel = input('Continue');
  readonly cancelLabel = input('Cancel');
  readonly inputLabel = input('Value');
  readonly placeholder = input('');
  readonly initialValue = input('');
  readonly multiline = input(false, { transform: booleanAttribute });
  readonly rows = input(4);
  readonly submitted = output<string>();
  readonly cancelled = output<void>();

  readonly titleId = `tx-prompt-title-${++promptUid}`;
  readonly fieldId = `tx-prompt-field-${promptUid}`;
  readonly draft = signal('');
  readonly canSubmit = computed(() => this.draft().trim().length > 0);
  private readonly host = inject(ElementRef<HTMLElement>);

  constructor() {
    afterNextRender(() => {
      this.draft.set(this.initialValue());
      const field = this.host.nativeElement.querySelector(`#${this.fieldId}`);
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
        field.focus();
        field.select();
      }
    });
  }

  handleValue(value: string): void {
    this.draft.set(value);
  }

  handleSubmit(): void {
    const value = this.draft().trim();
    if (!value)
      return;
    this.submitted.emit(value);
  }

  handleFieldKey(event: KeyboardEvent): void {
    if (event.key !== 'Enter')
      return;
    if (this.multiline()) {
      if (!(event.ctrlKey || event.metaKey))
        return;
      event.preventDefault();
      this.handleSubmit();
      return;
    }
    if (event.shiftKey)
      return;
    event.preventDefault();
    this.handleSubmit();
  }
}
