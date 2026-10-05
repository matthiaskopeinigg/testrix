import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import {
  DATABASE_DEFAULT_PORTS,
  DATABASE_TYPE_IDS,
  DATABASE_TYPE_LABELS,
  formatDatabaseConnectionString,
  parseDatabaseConnectionString,
  parseDatabaseConnectionTabNodeId,
  usesOracleThin,
  type DatabaseConnection,
  type DatabaseType,
} from '@testrix/contracts';
import { TxButtonComponent, TxCheckComponent, TxHintComponent, TxInputComponent, TxSelectComponent, TxSelectOptionDirective } from '@testrix/ui';

import { DesktopApiService } from '../../core/desktop-api.service';
import { WorkbenchStore, type WorkbenchTab } from '../workbench/workbench.store';
import { DatabaseStore } from './database.store';
import { DatabaseTypeIconComponent } from './database-type-icon.component';

@Component({
  selector: 'tx-database-connection-editor',
  standalone: true,
  imports: [
    TxButtonComponent,
    TxCheckComponent,
    TxHintComponent,
    TxInputComponent,
    TxSelectComponent,
    TxSelectOptionDirective,
    DatabaseTypeIconComponent,
  ],
  templateUrl: './database-connection-editor.component.html',
  styleUrl: './database-connection-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatabaseConnectionEditorComponent {
  readonly tab = input.required<WorkbenchTab>();
  private readonly store = inject(DatabaseStore);
  private readonly desktop = inject(DesktopApiService);
  private readonly workbench = inject(WorkbenchStore);

  readonly testMessage = signal<string | null>(null);
  readonly testing = signal(false);
  readonly draft = signal<DatabaseConnection | null>(null);
  readonly saved = signal<DatabaseConnection | null>(null);
  readonly connectionString = signal('');
  readonly stringError = signal<string | null>(null);

  readonly typeOptions = DATABASE_TYPE_IDS.map((id) => ({ value: id, label: DATABASE_TYPE_LABELS[id] }));

  engineType(value: string): DatabaseType {
    return value as DatabaseType;
  }

  readonly dirty = computed(() => {
    const draft = this.draft();
    const saved = this.saved();
    if (!draft || !saved)
      return false;
    return JSON.stringify(this.persistable(draft)) !== JSON.stringify(this.persistable(saved));
  });

  constructor() {
    effect(() => {
      const id = parseDatabaseConnectionTabNodeId(this.tab().nodeId);
      const connection = id ? this.store.connectionById(id) : null;
      untracked(() => {
        if (!connection) {
          this.draft.set(null);
          this.saved.set(null);
          return;
        }
        if (this.draft()?.id === connection.id && this.dirty())
          return;
        this.saved.set({ ...connection });
        this.draft.set({ ...connection });
        this.connectionString.set(formatDatabaseConnectionString(connection));
        this.stringError.set(null);
      });
    });
  }

  handleName(value: string): void {
    this.patchDraft({ name: value });
  }

  handleType(value: string): void {
    const draft = this.draft();
    if (!draft)
      return;
    const type = value as DatabaseType;
    const port =
      draft.port === DATABASE_DEFAULT_PORTS[draft.type] ? DATABASE_DEFAULT_PORTS[type] : draft.port;
    this.patchDraft({ type, port, host: type === 'sqlite' ? '' : draft.host || 'localhost' });
  }

  handleHost(value: string): void {
    this.patchDraft({ host: value });
  }

  handlePort(value: string): void {
    const port = Number.parseInt(value, 10);
    if (Number.isFinite(port))
      this.patchDraft({ port });
  }

  portValue(port: number): string {
    return `${port}`;
  }

  handleUser(value: string): void {
    this.patchDraft({ user: value });
  }

  handlePassword(value: string): void {
    this.patchDraft({ password: value });
  }

  handleDatabase(value: string): void {
    this.patchDraft({ database: value });
  }

  patchFile(value: string): void {
    this.patchDraft({ filePath: value });
  }

  patchClient(value: string): void {
    this.patchDraft({ clientPath: value });
  }

  async handleChooseSqlite(): Promise<void> {
    const path = await this.desktop.chooseFile('sqlite');
    if (path)
      this.patchDraft({ filePath: path });
  }

  async handleChooseOracle(): Promise<void> {
    const path = await this.desktop.chooseFile('oracle-client');
    if (path)
      this.patchDraft({ clientPath: path });
  }

  handleTls(checked: boolean): void {
    this.patchDraft({ tls: checked });
  }

  handleBoot(checked: boolean): void {
    this.patchDraft({ connectOnBoot: checked });
  }

  handleUseSid(checked: boolean): void {
    this.patchDraft({ useSid: checked });
  }

  isOracleThin(connection: DatabaseConnection): boolean {
    return usesOracleThin(connection);
  }

  handleOracleThin(checked: boolean): void {
    this.patchDraft({ oracleThin: checked });
  }

  timeoutValue(value: number | undefined): string {
    return value == null ? '' : `${value}`;
  }

  handleConnectTimeout(value: string): void {
    this.patchTimeout('connectTimeoutMs', value);
  }

  handleCommandTimeout(value: string): void {
    this.patchTimeout('commandTimeoutMs', value);
  }

  handleBusyTimeout(value: string): void {
    this.patchTimeout('busyTimeoutMs', value);
  }

  handleConnectionString(value: string): void {
    this.connectionString.set(value);
    const parsed = parseDatabaseConnectionString(value);
    if (!parsed) {
      this.stringError.set(value.trim() ? 'Could not parse this connection string.' : null);
      return;
    }
    this.stringError.set(null);
    const draft = this.draft();
    if (!draft)
      return;
    const type = parsed.type ?? draft.type;
    this.patchDraft(
      {
        type,
        host: parsed.host ?? (type === 'sqlite' ? '' : draft.host),
        port: parsed.port ?? (type === draft.type ? draft.port : DATABASE_DEFAULT_PORTS[type]),
        user: parsed.user ?? draft.user,
        password: parsed.password ?? draft.password,
        database: parsed.database ?? draft.database,
        filePath: parsed.filePath ?? draft.filePath,
        tls: parsed.tls ?? draft.tls,
      },
      false,
    );
  }

  handleSave(): void {
    const draft = this.draft();
    if (!draft)
      return;
    this.store.saveConnection(draft);
    this.workbench.renameDatabaseConnectionTabs(draft.id, draft.name.trim() || draft.name);
    this.saved.set({ ...draft });
    this.connectionString.set(formatDatabaseConnectionString(draft));
    this.testMessage.set(null);
  }

  handleCancel(): void {
    const draft = this.draft();
    if (draft && this.store.isPendingConnection(draft.id)) {
      this.store.discardPendingConnection(draft.id);
      this.closeTab();
      return;
    }
    if (!this.dirty()) {
      this.closeTab();
      return;
    }
    const saved = this.saved();
    if (!saved)
      return;
    this.draft.set({ ...saved });
    this.connectionString.set(formatDatabaseConnectionString(saved));
    this.stringError.set(null);
    this.testMessage.set(null);
  }

  async handleTest(): Promise<void> {
    const draft = this.draft();
    if (!draft)
      return;
    this.testing.set(true);
    const error = await this.store.testConnection(draft);
    this.testing.set(false);
    this.testMessage.set(error ? error : 'Connected');
  }

  private patchTimeout(
    key: 'connectTimeoutMs' | 'commandTimeoutMs' | 'busyTimeoutMs',
    value: string,
  ): void {
    const parsed = Number.parseInt(value, 10);
    this.patchDraft({ [key]: Number.isFinite(parsed) ? parsed : undefined });
  }

  private patchDraft(patch: Partial<DatabaseConnection>, syncString = true): void {
    const draft = this.draft();
    if (!draft)
      return;
    const next = { ...draft, ...patch };
    this.draft.set(next);
    if (syncString)
      this.connectionString.set(formatDatabaseConnectionString(next));
  }

  private persistable(connection: DatabaseConnection): Partial<DatabaseConnection> {
    const {
      name: _name,
      id: _id,
      kind: _kind,
      ...fields
    } = connection;
    return fields;
  }

  private closeTab(): void {
    const group = this.workbench.focusedGroup();
    if (group)
      this.workbench.close(group.id, this.tab().id);
  }
}
