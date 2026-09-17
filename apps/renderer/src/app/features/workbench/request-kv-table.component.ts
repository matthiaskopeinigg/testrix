import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { TxCheckComponent, TxHintComponent } from '@testrix/ui';

import { emptyMockRow, type MockKeyValue } from './request-mock';

@Component({
  selector: 'tx-request-kv-table',
  standalone: true,
  imports: [TxCheckComponent, TxHintComponent],
  templateUrl: './request-kv-table.component.html',
  styleUrl: './request-kv-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestKvTableComponent {
  readonly label = input.required<string>();
  readonly rows = model.required<MockKeyValue[]>();

  trackRow(_index: number, row: MockKeyValue): string {
    return row.id;
  }

  enableLabel(row: MockKeyValue): string {
    return row.enabled ? 'Included in the request' : 'Skipped in the request';
  }

  handleEnabled(index: number, enabled: boolean): void {
    this.patch(index, { enabled });
  }

  handleKey(index: number, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return;
    this.patch(index, { key: target.value }, true);
  }

  handleValue(index: number, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return;
    this.patch(index, { value: target.value }, true);
  }

  private patch(index: number, patch: Partial<MockKeyValue>, grow = false): void {
    const next = this.rows().map((row, rowIndex) =>
      rowIndex === index ? { ...row, ...patch } : row,
    );
    const last = next[next.length - 1];
    if (grow && last && (last.key.trim() || last.value.trim()))
      next.push(emptyMockRow());
    this.rows.set(next);
  }
}
