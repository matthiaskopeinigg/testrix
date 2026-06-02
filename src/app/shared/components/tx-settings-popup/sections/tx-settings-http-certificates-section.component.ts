import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ElectronService } from '@app/core/electron/electron.service';
import { TxNotificationService } from '@app/core/notifications/tx-notification.service';
import {
  HTTP_CERTIFICATE_ENTRY_MAX,
  createHttpClientCertificateEntry,
  type HttpCertificatesSettings,
  type HttpClientCertificateEntry,
} from '@shared/config';

import { TxButtonComponent } from '../../tx-button/tx-button.component';
import { TxFormFieldComponent } from '../../tx-form-field/tx-form-field.component';
import { TxIconComponent } from '../../tx-icon/tx-icon.component';
import { TxInputComponent } from '../../tx-input/tx-input.component';

interface CertificateDraft {
  readonly hostPattern: string;
  readonly passphrase: string;
  readonly clientCertPath: string | null;
  readonly clientKeyPath: string | null;
  readonly pfxPath: string | null;
}

type CertificateFileField = keyof Pick<
  CertificateDraft,
  'clientCertPath' | 'clientKeyPath' | 'pfxPath'
>;

const EMPTY_DRAFT: CertificateDraft = {
  hostPattern: '',
  passphrase: '',
  clientCertPath: null,
  clientKeyPath: null,
  pfxPath: null,
};

const CERT_FILE_PICKERS: Record<
  CertificateFileField,
  { readonly label: string; readonly extensions: readonly string[] }
> = {
  clientCertPath: { label: 'Certificate', extensions: ['crt', 'cer', 'pem', 'cert'] },
  clientKeyPath: { label: 'Private key', extensions: ['key', 'pem'] },
  pfxPath: { label: 'PKCS#12', extensions: ['pfx', 'p12'] },
};

@Component({
  selector: 'tx-settings-http-certificates-section',
  standalone: true,
  imports: [
    FormsModule,
    TxButtonComponent,
    TxFormFieldComponent,
    TxIconComponent,
    TxInputComponent,
  ],
  templateUrl: './tx-settings-http-certificates-section.component.html',
  styleUrl: './tx-settings-http-certificates-section.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxSettingsHttpCertificatesSectionComponent {
  readonly certificates = input.required<HttpCertificatesSettings>();
  readonly canPickFile = input(false);

  readonly certificatesChange = output<Partial<HttpCertificatesSettings>>();

  private readonly electron = inject(ElectronService);
  private readonly notifications = inject(TxNotificationService);

  protected readonly entryMax = HTTP_CERTIFICATE_ENTRY_MAX;
  protected readonly draft = signal<CertificateDraft>({ ...EMPTY_DRAFT });
  protected readonly editingEntryId = signal<string | null>(null);
  protected readonly showPassphrase = signal(false);

  protected emit(patch: Partial<HttpCertificatesSettings>): void {
    this.certificatesChange.emit(patch);
  }

  protected canAddEntry(): boolean {
    return this.certificates().entries.length < this.entryMax || this.editingEntryId() !== null;
  }

  protected isEditingEntry(id: string): boolean {
    return this.editingEntryId() === id;
  }

  protected saveButtonLabel(): string {
    return this.editingEntryId() ? 'Save certificate' : 'Add certificate';
  }

  protected displayHostname(entry: HttpClientCertificateEntry): string {
    const label = entry.hostPattern.trim();
    return label || 'All hosts';
  }

  protected passphraseInputType(): 'text' | 'password' {
    return this.showPassphrase() ? 'text' : 'password';
  }

  protected handleTogglePassphrase(): void {
    this.showPassphrase.update((value) => !value);
  }

  protected handleDraftHostChange(value: string): void {
    this.draft.update((draft) => ({ ...draft, hostPattern: value }));
  }

  protected handleDraftPassphraseChange(value: string): void {
    this.draft.update((draft) => ({ ...draft, passphrase: value }));
  }

  protected handleDraftPathChange(field: CertificateFileField, value: string): void {
    const trimmed = value.trim();
    this.draft.update((draft) => ({ ...draft, [field]: trimmed || null }));
  }

  protected handleSelectEntry(entry: HttpClientCertificateEntry): void {
    this.editingEntryId.set(entry.id);
    this.draft.set({
      hostPattern: entry.hostPattern,
      passphrase: entry.passphrase,
      clientCertPath: entry.clientCertPath,
      clientKeyPath: entry.clientKeyPath,
      pfxPath: entry.pfxPath,
    });
    this.showPassphrase.set(false);
  }

  protected handleCancelEdit(): void {
    this.editingEntryId.set(null);
    this.draft.set({ ...EMPTY_DRAFT });
    this.showPassphrase.set(false);
  }

  protected handleSaveCertificate(): void {
    const editingId = this.editingEntryId();
    if (!editingId && !this.canAddEntry()) {
      return;
    }

    const draft = this.draft();
    const hostPattern = draft.hostPattern.trim();
    if (!hostPattern) {
      this.notifications.showError('Enter a hostname pattern');
      return;
    }

    const hasPfx = Boolean(draft.pfxPath?.trim());
    const hasCrtKey = Boolean(draft.clientCertPath?.trim() && draft.clientKeyPath?.trim());
    if (!hasPfx && !hasCrtKey) {
      this.notifications.showError('Select a PFX file or both CRT and KEY files');
      return;
    }

    if (editingId) {
      this.emit({
        entries: this.certificates().entries.map((entry) =>
          entry.id === editingId
            ? {
                ...entry,
                hostPattern,
                passphrase: draft.passphrase,
                clientCertPath: draft.clientCertPath,
                clientKeyPath: draft.clientKeyPath,
                pfxPath: draft.pfxPath,
              }
            : entry,
        ),
      });
    } else {
      this.emit({
        entries: [
          ...this.certificates().entries,
          createHttpClientCertificateEntry({
            hostPattern,
            passphrase: draft.passphrase,
            clientCertPath: draft.clientCertPath,
            clientKeyPath: draft.clientKeyPath,
            pfxPath: draft.pfxPath,
          }),
        ],
      });
    }

    this.handleCancelEdit();
  }

  protected handleRemoveEntry(id: string, event: Event): void {
    event.stopPropagation();
    if (this.editingEntryId() === id) {
      this.handleCancelEdit();
    }
    this.emit({
      entries: this.certificates().entries.filter((entry) => entry.id !== id),
    });
  }

  protected async handleBrowseFile(field: CertificateFileField): Promise<void> {
    if (!this.canPickFile()) {
      this.notifications.showError('Available in the desktop app only');
      return;
    }

    const bridge = this.electron.bridge();
    if (!bridge) {
      this.notifications.showError('Available in the desktop app only');
      return;
    }

    const picker = CERT_FILE_PICKERS[field];

    try {
      const picked = await bridge.shell.pickFile({
        filters: [{ name: picker.label, extensions: [...picker.extensions] }],
      });
      if (!picked) {
        return;
      }
      this.draft.update((draft) => ({ ...draft, [field]: picked.filePath }));
    } catch {
      this.notifications.showError('Could not choose file');
    }
  }
}
