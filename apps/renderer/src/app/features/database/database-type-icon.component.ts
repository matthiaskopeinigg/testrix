import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { DatabaseType } from '@testrix/contracts';

@Component({
  selector: 'tx-database-type-icon',
  standalone: true,
  templateUrl: './database-type-icon.component.html',
  styleUrl: './database-type-icon.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatabaseTypeIconComponent {
  readonly type = input<DatabaseType | null>(null);
  readonly kind = input<
    | 'folder'
    | 'query'
    | 'schema'
    | 'table'
    | 'view'
    | 'column'
    | 'index'
    | 'fk'
    | 'diagram'
    | 'picker'
    | 'engine'
    | 'routine'
    | 'trigger'
    | 'sequence'
    | 'user'
  >('engine');
}
