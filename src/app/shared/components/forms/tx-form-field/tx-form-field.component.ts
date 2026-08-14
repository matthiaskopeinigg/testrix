import { ChangeDetectionStrategy, Component, ContentChild, input } from '@angular/core';

import { TxDropdownComponent } from '../tx-dropdown/tx-dropdown.component';

@Component({
  selector: 'tx-form-field',
  standalone: true,
  imports: [],
  templateUrl: './tx-form-field.component.html',
  styleUrl: './tx-form-field.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxFormFieldComponent {
  readonly label = input('');
  readonly controlId = input<string | undefined>(undefined);

  @ContentChild(TxDropdownComponent)
  protected readonly dropdownContent?: TxDropdownComponent;

  protected captionElementId(): string | null {
    const id = this.controlId()?.trim();
    return id ? `${id}-label` : null;
  }
}
