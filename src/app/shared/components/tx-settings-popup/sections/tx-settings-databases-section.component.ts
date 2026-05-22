import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  createDefaultDatabaseConnection,
  defaultPortForDatabaseType,
  type DatabaseConnection,
  type DatabaseType,
} from '@shared/config';

import { ElectronService } from '@app/core/electron/electron.service';
import { TxButtonComponent } from '../../tx-button/tx-button.component';
import { TxDropdownComponent } from '../../tx-dropdown/tx-dropdown.component';
import { TxFormFieldComponent } from '../../tx-form-field/tx-form-field.component';
import { TxIconComponent } from '../../tx-icon/tx-icon.component';
import { TxInputComponent } from '../../tx-input/tx-input.component';
import { TxToggleComponent } from '../../tx-toggle/tx-toggle.component';

const DATABASE_TYPE_OPTIONS: readonly { value: DatabaseType; label: string }[] = [
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL / MariaDB' },
  { value: 'mssql', label: 'SQL Server' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'redis', label: 'Redis' },
];

@Component({
  selector: 'tx-settings-databases-section',
  standalone: true,
  imports: [
    FormsModule,
    TxButtonComponent,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxIconComponent,
    TxInputComponent,
    TxToggleComponent,
  ],
  templateUrl: './tx-settings-databases-section.component.html',
  styleUrl: './tx-settings-databases-section.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxSettingsDatabasesSectionComponent {
  readonly connections = input.required<readonly DatabaseConnection[]>();
  readonly canPickFile = input(false);

  readonly connectionsChange = output<readonly DatabaseConnection[]>();

  private readonly electron = inject(ElectronService);

  protected readonly typeOptions = DATABASE_TYPE_OPTIONS.map((entry) => ({
    value: entry.value,
    label: entry.label,
  }));

  protected readonly expandedIndex = signal<number | null>(null);
  protected readonly testingIndex = signal<number | null>(null);
  protected readonly testMessage = signal<string | null>(null);

  protected readonly hasConnections = computed(() => this.connections().length > 0);

  protected typeLabel(type: DatabaseType | undefined): string {
    return DATABASE_TYPE_OPTIONS.find((entry) => entry.value === type)?.label ?? type ?? 'Unknown';
  }

  protected connectionSummary(conn: DatabaseConnection): string {
    if (conn.type === 'sqlite') {
      return conn.filePath || conn.database || 'No file path';
    }
    const host = conn.host || 'localhost';
    const port = conn.port ? `:${conn.port}` : '';
    return `${host}${port}`;
  }

  protected handleAddConnection(): void {
    const next = [...this.connections(), createDefaultDatabaseConnection()];
    this.connectionsChange.emit(next);
    this.expandedIndex.set(next.length - 1);
  }

  protected handleRemoveConnection(index: number): void {
    const next = this.connections().filter((_, i) => i !== index);
    this.connectionsChange.emit(next);
    const expanded = this.expandedIndex();
    if (expanded === index) {
      this.expandedIndex.set(null);
    } else if (expanded != null && expanded > index) {
      this.expandedIndex.set(expanded - 1);
    }
  }

  protected handleToggleExpand(index: number): void {
    this.expandedIndex.update((current) => (current === index ? null : index));
  }

  protected handlePatchConnection(index: number, patch: Partial<DatabaseConnection>): void {
    const next = this.connections().map((conn, i) => (i === index ? { ...conn, ...patch } : conn));
    this.connectionsChange.emit(next);
  }

  protected handleTypeChange(index: number, type: DatabaseType): void {
    const conn = this.connections()[index];
    if (!conn) {
      return;
    }
    this.handlePatchConnection(index, {
      type,
      port: defaultPortForDatabaseType(type),
    });
  }

  protected async handlePickSqliteFile(index: number): Promise<void> {
    const bridge = this.electron.bridge();
    if (!bridge) {
      return;
    }
    const picked = await bridge.shell.pickFile({
      filters: [{ name: 'SQLite database', extensions: ['db', 'sqlite', 'sqlite3'] }],
    });
    if (!picked) {
      return;
    }
    this.handlePatchConnection(index, { filePath: picked.filePath });
  }

  protected async handleTestConnection(index: number): Promise<void> {
    const conn = this.connections()[index];
    const bridge = this.electron.bridge();
    if (!conn || !bridge?.database) {
      this.testMessage.set('Database testing is only available in the desktop app.');
      return;
    }
    this.testingIndex.set(index);
    this.testMessage.set(null);
    try {
      await bridge.database.testConnection(conn);
      this.testMessage.set('Connection successful.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed.';
      this.testMessage.set(message);
    } finally {
      this.testingIndex.set(null);
    }
  }

  protected isExpanded(index: number): boolean {
    return this.expandedIndex() === index;
  }

  protected isTesting(index: number): boolean {
    return this.testingIndex() === index;
  }
}
