import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
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
import type {
  DatabaseConnectionStatus,
  DatabaseConnectionStatusMap,
} from '@shared/database/connection-status.schema';
import { unwrapIpcInvokeError } from '@shared/errors';

import { ElectronService } from '@app/core/electron/electron.service';
import { TxBannerComponent } from '../../tx-banner/tx-banner.component';
import { TxButtonComponent } from '../../tx-button/tx-button.component';
import { TxDropdownComponent } from '../../tx-dropdown/tx-dropdown.component';
import { TxFormFieldComponent } from '../../tx-form-field/tx-form-field.component';
import { TxIconComponent } from '../../tx-icon/tx-icon.component';
import { TxInputComponent } from '../../tx-input/tx-input.component';
import { TxTagComponent } from '../../tx-tag/tx-tag.component';
import { TxToggleComponent } from '../../tx-toggle/tx-toggle.component';

const DATABASE_TYPE_OPTIONS: readonly { value: DatabaseType; label: string }[] = [
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL / MariaDB' },
  { value: 'mssql', label: 'SQL Server' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'redis', label: 'Redis' },
];

type TestOutcome = { readonly kind: 'success' | 'error'; readonly message: string };

@Component({
  selector: 'tx-settings-databases-section',
  standalone: true,
  imports: [
    FormsModule,
    TxBannerComponent,
    TxButtonComponent,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxIconComponent,
    TxInputComponent,
    TxTagComponent,
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
  protected readonly testOutcomes = signal<Readonly<Record<string, TestOutcome>>>({});
  protected readonly statusById = signal<DatabaseConnectionStatusMap>({});

  protected readonly hasConnections = computed(() => this.connections().length > 0);

  constructor() {
    effect(() => {
      const count = this.connections().length;
      if (count > 0) {
        void this.refreshStatusesFromMain();
      }
    });
  }

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

  protected statusFor(conn: DatabaseConnection): DatabaseConnectionStatus | null {
    return this.statusById()[conn.id] ?? null;
  }

  protected statusTagVariant(conn: DatabaseConnection): 'default' | 'success' | 'warning' | 'error' | 'info' {
    const status = this.statusFor(conn);
    switch (status?.state) {
      case 'connected':
        return 'success';
      case 'error':
        return 'error';
      case 'checking':
        return 'info';
      default:
        return 'default';
    }
  }

  protected statusLabel(conn: DatabaseConnection): string {
    const status = this.statusFor(conn);
    switch (status?.state) {
      case 'checking':
        return 'Checking…';
      case 'connected':
        return 'Connected';
      case 'error':
        return 'Failed';
      default:
        return 'Not checked';
    }
  }

  protected statusTitle(conn: DatabaseConnection): string | null {
    const status = this.statusFor(conn);
    if (status?.state === 'error' && status.message) {
      return status.message;
    }
    return null;
  }

  protected testOutcomeFor(conn: DatabaseConnection): TestOutcome | null {
    return this.testOutcomes()[conn.id] ?? null;
  }

  protected handleAddConnection(): void {
    const next = [...this.connections(), createDefaultDatabaseConnection()];
    this.connectionsChange.emit(next);
    this.expandedIndex.set(next.length - 1);
  }

  protected handleRemoveConnection(index: number): void {
    const removed = this.connections()[index];
    const next = this.connections().filter((_, i) => i !== index);
    this.connectionsChange.emit(next);
    if (removed) {
      this.testOutcomes.update((map) => {
        const copy = { ...map };
        delete copy[removed.id];
        return copy;
      });
      this.statusById.update((map) => {
        const copy = { ...map };
        delete copy[removed.id];
        return copy;
      });
    }
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
    if ('host' in patch || 'port' in patch || 'type' in patch || 'filePath' in patch) {
      const conn = next[index];
      if (conn) {
        this.statusById.update((map) => ({
          ...map,
          [conn.id]: { state: 'unknown' },
        }));
      }
    }
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
      this.testOutcomes.update((map) => ({
        ...map,
        [conn?.id ?? '']: {
          kind: 'error',
          message: 'Database testing is only available in the desktop app.',
        },
      }));
      return;
    }
    this.testingIndex.set(index);
    this.testOutcomes.update((map) => {
      const copy = { ...map };
      delete copy[conn.id];
      return copy;
    });
    this.statusById.update((map) => ({
      ...map,
      [conn.id]: { state: 'checking' },
    }));
    try {
      await bridge.database.testConnection(conn);
      this.testOutcomes.update((map) => ({
        ...map,
        [conn.id]: { kind: 'success', message: 'Connection successful.' },
      }));
      await this.refreshStatusesFromMain();
    } catch (err: unknown) {
      const ipc = unwrapIpcInvokeError(err);
      const message =
        ipc?.userMessage ?? (err instanceof Error ? err.message : 'Connection failed.');
      this.testOutcomes.update((map) => ({
        ...map,
        [conn.id]: { kind: 'error', message },
      }));
      this.statusById.update((map) => ({
        ...map,
        [conn.id]: { state: 'error', message, checkedAt: new Date().toISOString() },
      }));
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

  private async refreshStatusesFromMain(): Promise<void> {
    const bridge = this.electron.bridge()?.database;
    if (!bridge?.getConnectionStatuses) {
      return;
    }
    try {
      const statuses = await bridge.getConnectionStatuses();
      this.statusById.set(statuses);
    } catch {
      // ignore — statuses are optional UI hints
    }
  }
}
