import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  collectDatabaseConnectionFolders,
  defaultPortForDatabaseType,
  findDatabaseConnection,
  type DatabaseConnection,
  type DatabaseType,
} from '@shared/config';
import type {
  DatabaseConnectionStatus,
  DatabaseConnectionStatusMap,
} from '@shared/database/connection-status.schema';
import {
  databaseNameFieldLabel,
  databaseNameFieldPlaceholder,
  formatDatabaseConnectionError,
  parseDatabaseConnectionTabResourceId,
} from '@shared/database';

import { DatabaseConnectionsService } from '@app/core/database/database-connections.service';
import { ElectronService } from '@app/core/electron/electron.service';
import { TxNotificationService } from '@app/core/notifications/tx-notification.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { TxBannerComponent } from '@app/shared/components/feedback/tx-banner/tx-banner.component';
import { TxButtonComponent } from '@app/shared/components/forms/tx-button/tx-button.component';
import { TxDropdownComponent } from '@app/shared/components/forms/tx-dropdown/tx-dropdown.component';
import { TxFormFieldComponent } from '@app/shared/components/forms/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/forms/tx-input/tx-input.component';
import { TxTagComponent } from '@app/shared/components/forms/tx-tag/tx-tag.component';
import { TxToggleComponent } from '@app/shared/components/forms/tx-toggle/tx-toggle.component';

import { iconForDatabaseType } from './database-type-icon';

const FOLDER_NONE = '';
const FOLDER_NEW = '__tx_new_folder__';

const DATABASE_TYPE_OPTIONS: readonly { value: DatabaseType; label: string }[] = [
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'mariadb', label: 'MariaDB' },
  { value: 'mssql', label: 'SQL Server' },
  { value: 'oracle', label: 'Oracle' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'cockroachdb', label: 'CockroachDB' },
  { value: 'clickhouse', label: 'ClickHouse' },
  { value: 'mongodb', label: 'MongoDB' },
  { value: 'redis', label: 'Redis' },
];

type TestOutcome = { readonly kind: 'success' | 'error'; readonly message: string };

@Component({
  selector: 'app-database-connection-editor',
  standalone: true,
  imports: [
    FormsModule,
    TxBannerComponent,
    TxButtonComponent,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxInputComponent,
    TxTagComponent,
    TxToggleComponent,
  ],
  templateUrl: './database-connection-editor.component.html',
  styleUrl: './database-connection-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatabaseConnectionEditorComponent {
  private readonly connections = inject(DatabaseConnectionsService);
  private readonly electron = inject(ElectronService);
  private readonly notifications = inject(TxNotificationService);
  private readonly workspaceEditor = inject(WorkspaceEditorService);

  readonly resourceId = input.required<string>();
  readonly active = input(false);

  protected readonly typeOptions = DATABASE_TYPE_OPTIONS.map((entry) => ({
    value: entry.value,
    label: entry.label,
    icon: iconForDatabaseType(entry.value),
  }));

  protected readonly testing = signal(false);
  protected readonly testOutcome = signal<TestOutcome | null>(null);
  protected readonly statusById = signal<DatabaseConnectionStatusMap>({});
  protected readonly draft = signal<DatabaseConnection | null>(null);
  private userTouched = false;
  private passwordTouched = false;

  protected readonly connectionId = computed(() => parseDatabaseConnectionTabResourceId(this.resourceId()));

  protected readonly connection = computed(() => this.draft());

  protected readonly storedConnection = computed(() => {
    const id = this.connectionId();
    if (!id) {
      return null;
    }
    return findDatabaseConnection(this.connections.persistedNodes(), id);
  });

  /** True when the form differs from the last saved profile (or is a new draft). */
  protected readonly isDirty = computed(() => {
    const draft = this.draft();
    if (!draft) {
      return false;
    }
    if (this.connections.isDraft(draft.id)) {
      return true;
    }
    const stored = this.storedConnection();
    return stored != null && !connectionEditorEquals(stored, draft);
  });

  protected readonly canPickFile = computed(() => Boolean(this.electron.bridge()?.shell?.pickFile));

  protected readonly canPickDirectory = computed(() => Boolean(this.electron.bridge()?.config?.pickDirectory));

  protected readonly folderOptions = computed(() => {
    const folders = collectDatabaseConnectionFolders(this.connections.nodes());
    return [
      { value: FOLDER_NONE, label: '(none)' },
      ...folders.map((folder) => ({ value: folder.id, label: folder.label })),
      { value: FOLDER_NEW, label: 'New folder…' },
    ];
  });

  protected readonly folderValue = computed(() => {
    const id = this.connectionId();
    if (!id) {
      return FOLDER_NONE;
    }
    return this.connections.parentFolderId(id) ?? FOLDER_NONE;
  });

  constructor() {
    effect(() => {
      const id = this.connectionId();
      const stored = id != null ? this.connections.find(id) : null;
      if (this.draft()?.id === stored?.id) {
        return;
      }
      this.userTouched = false;
      this.passwordTouched = false;
      this.draft.set(stored ? cloneConnectionDraft(stored) : null);
    });
    effect(() => {
      if (this.connection()) {
        void this.refreshStatusesFromMain();
      }
    });
  }

  protected typeLabel(type: DatabaseType | undefined): string {
    return DATABASE_TYPE_OPTIONS.find((entry) => entry.value === type)?.label ?? type ?? 'Unknown';
  }

  protected databaseFieldLabel(conn: DatabaseConnection): string {
    if (conn.type === 'oracle') {
      return conn.useSid ? 'SID' : 'Service name';
    }
    return databaseNameFieldLabel(conn.type);
  }

  protected databaseFieldPlaceholder(conn: DatabaseConnection): string {
    if (conn.type === 'oracle') {
      return conn.useSid ? 'ORCL' : 'XEPDB1 or ORCL';
    }
    return databaseNameFieldPlaceholder(conn.type);
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

  protected handleUserFocus(): void {
    this.userTouched = true;
  }

  protected handlePasswordFocus(): void {
    this.passwordTouched = true;
  }

  protected handlePatch(patch: Partial<DatabaseConnection>): void {
    const current = this.draft();
    if (!current) {
      return;
    }
    const nextPatch = sanitizeCredentialPatch(current, patch, this.userTouched, this.passwordTouched);
    if (!nextPatch) {
      return;
    }
    const next = { ...current, ...nextPatch };
    this.draft.set(next);
    this.testOutcome.set(null);
    if (this.connections.isDraft(next.id)) {
      void this.connections.patchConnection(next.id, connectionPersistPatch(next));
    }
  }

  protected handleTypeChange(type: DatabaseType): void {
    this.handlePatch({ type, port: defaultPortForDatabaseType(type) });
  }

  protected async handleFolderChange(value: string): Promise<void> {
    const conn = this.connection();
    if (!conn) {
      return;
    }
    const currentFolder = this.connections.parentFolderId(conn.id) ?? FOLDER_NONE;
    if (value !== FOLDER_NEW && (value || FOLDER_NONE) === currentFolder) {
      return;
    }
    if (value === FOLDER_NEW) {
      const folderId = await this.connections.createFolder();
      await this.connections.moveConnectionToFolder(conn.id, folderId);
      return;
    }
    await this.connections.moveConnectionToFolder(conn.id, value || null);
  }

  protected async handlePickSqliteFile(): Promise<void> {
    const picked = await this.electron.bridge()?.shell.pickFile({
      filters: [{ name: 'SQLite database', extensions: ['db', 'sqlite', 'sqlite3'] }],
    });
    if (!picked) {
      return;
    }
    this.handlePatch({ filePath: picked.filePath });
  }

  protected async handlePickOracleClient(): Promise<void> {
    const picked = await this.electron.bridge()?.config?.pickDirectory();
    if (!picked) {
      return;
    }
    this.handlePatch({ clientPath: picked });
  }

  protected async handleTestConnection(): Promise<void> {
    const conn = this.connection();
    const bridge = this.electron.bridge();
    if (!conn || !bridge?.database) {
      this.testOutcome.set({
        kind: 'error',
        message: 'Database testing is only available in the desktop app.',
      });
      return;
    }
    this.testing.set(true);
    this.testOutcome.set(null);
    this.statusById.update((map) => ({ ...map, [conn.id]: { state: 'checking' } }));
    const requestId = conn.id;
    const probe = connectionForProbe(conn, this.storedConnection());
    try {
      await bridge.database.testConnection(probe);
      if (this.connectionId() !== requestId) {
        return;
      }
      this.testOutcome.set({ kind: 'success', message: 'Connection successful.' });
      if (!this.connections.isDraft(requestId)) {
        await this.refreshStatusesFromMain();
      } else {
        this.statusById.update((map) => ({
          ...map,
          [conn.id]: { state: 'connected', checkedAt: new Date().toISOString() },
        }));
      }
    } catch (err: unknown) {
      if (this.connectionId() !== requestId) {
        return;
      }
      const message = formatDatabaseConnectionError(err);
      this.testOutcome.set({ kind: 'error', message });
      this.statusById.update((map) => ({
        ...map,
        [conn.id]: { state: 'error', message, checkedAt: new Date().toISOString() },
      }));
    } finally {
      if (this.connectionId() === requestId) {
        this.testing.set(false);
      }
    }
  }

  protected async handleSave(): Promise<void> {
    const latest = this.draft();
    if (!latest || !this.isDirty()) {
      return;
    }
    try {
      if (this.connections.isDraft(latest.id)) {
        await this.connections.commitDraft(latest);
      } else {
        await this.connections.patchConnection(
          latest.id,
          connectionPersistPatch(latest, this.storedConnection()),
        );
      }
      this.notifications.showSuccess('Connection saved');
    } catch (err: unknown) {
      this.testOutcome.set({
        kind: 'error',
        message: formatDatabaseConnectionError(err),
      });
    }
  }

  protected handleCancel(): void {
    const id = this.connectionId();
    if (!id) {
      return;
    }
    if (this.connections.isDraft(id)) {
      this.connections.discardDraft(id);
      this.workspaceEditor.closeTabsForResourceIds([this.resourceId()]);
      return;
    }
    const stored = this.storedConnection();
    if (stored) {
      this.userTouched = false;
      this.passwordTouched = false;
      this.draft.set(cloneConnectionDraft(stored));
    }
    this.testOutcome.set(null);
  }

  private async refreshStatusesFromMain(): Promise<void> {
    const bridge = this.electron.bridge()?.database;
    if (!bridge?.getConnectionStatuses) {
      return;
    }
    try {
      this.statusById.set(await bridge.getConnectionStatuses());
    } catch {
      /* statuses are optional UI hints */
    }
  }
}

function connectionEditorEquals(a: DatabaseConnection, b: DatabaseConnection): boolean {
  return JSON.stringify(connectionPersistPatch(b, a)) === JSON.stringify(connectionPersistPatch(a, a));
}

/**
 * Fields written on Save. Blank user/password keep the stored secrets so a
 * browser-cleared password field cannot wipe the profile.
 */
export function connectionPersistPatch(
  latest: DatabaseConnection,
  stored?: DatabaseConnection | null,
): Partial<Omit<DatabaseConnection, 'id' | 'kind'>> {
  return {
    name: latest.name,
    type: latest.type,
    host: latest.host,
    port: latest.port,
    user: keepSecret(latest.user, stored?.user),
    password: keepSecret(latest.password, stored?.password),
    database: latest.database,
    filePath: latest.filePath,
    clientPath: latest.clientPath,
    useSid: latest.useSid,
    tls: latest.tls,
    connectTimeoutMs: latest.connectTimeoutMs,
    commandTimeoutMs: latest.commandTimeoutMs,
    busyTimeoutMs: latest.busyTimeoutMs,
    connectOnBoot: latest.connectOnBoot,
  };
}

/** Copies a connection so the editor cannot mutate the persisted tree in place. */
export function cloneConnectionDraft(connection: DatabaseConnection): DatabaseConnection {
  return { ...connection };
}

/**
 * Drops spurious empty user/password updates until the field has been focused.
 *
 * @returns The patch to apply, or `null` when nothing should change.
 */
export function sanitizeCredentialPatch(
  current: DatabaseConnection,
  patch: Partial<DatabaseConnection>,
  userTouched: boolean,
  passwordTouched: boolean,
): Partial<DatabaseConnection> | null {
  const next: Partial<DatabaseConnection> = { ...patch };
  if ('user' in next && !userTouched && !next.user && current.user) {
    delete next.user;
  }
  if ('password' in next && !passwordTouched && !next.password && current.password) {
    delete next.password;
  }
  return Object.keys(next).length > 0 ? next : null;
}

/** Prefer the edited secret, otherwise keep the stored one. */
function keepSecret(next: string | undefined, stored: string | undefined): string | undefined {
  return next || stored;
}

/** Test uses stored user/password when the form field was blanked by the browser. */
function connectionForProbe(
  draft: DatabaseConnection,
  stored: DatabaseConnection | null,
): DatabaseConnection {
  return {
    ...draft,
    user: keepSecret(draft.user, stored?.user),
    password: keepSecret(draft.password, stored?.password),
  };
}
