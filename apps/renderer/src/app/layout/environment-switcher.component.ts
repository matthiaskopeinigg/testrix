import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TxHintComponent, TxSelectComponent, type TxSelectOption } from '@testrix/ui';

import { EnvironmentsStore } from '../features/environments/environments.store';

const NONE_VALUE = '';

@Component({
  selector: 'tx-environment-switcher',
  standalone: true,
  imports: [TxHintComponent, TxSelectComponent],
  templateUrl: './environment-switcher.component.html',
  styleUrl: './environment-switcher.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-none]': '!activeId()',
  },
})
export class EnvironmentSwitcherComponent {
  private readonly environments = inject(EnvironmentsStore);

  readonly options = computed<readonly TxSelectOption[]>(() => [
    { value: NONE_VALUE, label: 'None', gapAfter: true },
    ...this.environments.items().map((item) => ({ value: item.id, label: item.name })),
  ]);

  readonly activeId = computed(() => {
    const id = this.environments.activeId();
    if (id && this.environments.items().some((item) => item.id === id)) {
      return id;
    }
    return NONE_VALUE;
  });

  handleSelect(id: string): void {
    this.environments.setActive(id || null);
  }
}
