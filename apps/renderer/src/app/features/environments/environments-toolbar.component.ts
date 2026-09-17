import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TxInputComponent } from '@testrix/ui';

import { EnvironmentsStore } from './environments.store';

@Component({
  selector: 'tx-environments-toolbar',
  standalone: true,
  imports: [TxInputComponent],
  templateUrl: './environments-toolbar.component.html',
  styleUrl: './environments-toolbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnvironmentsToolbarComponent {
  readonly store = inject(EnvironmentsStore);

  handleSearch(value: string): void {
    this.store.setSearchQuery(value);
  }
}
