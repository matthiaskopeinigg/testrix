import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  buildCollectionEnvironmentDropdownOptions,
  collectEnvironmentVariables,
  COLLECTION_ENVIRONMENT_NONE,
  type JwtAlgorithm,
  type JwtSecretSource,
  type JwtSigningProfile,
  type JwtToolMode,
} from '@shared/config';

import { EnvironmentsService } from '@app/core/environments/environments.service';
import { TxNotificationService } from '@app/core/notifications/tx-notification.service';
import { FileDialogService } from '@app/core/platform/file-dialog.service';
import { TxBannerComponent } from '@app/shared/components/feedback/tx-banner/tx-banner.component';
import { TxButtonComponent } from '@app/shared/components/forms/tx-button/tx-button.component';
import { TxCodeEditorComponent } from '@app/shared/components/editors/tx-code-editor/tx-code-editor.component';
import { TxDropdownComponent } from '@app/shared/components/forms/tx-dropdown/tx-dropdown.component';
import type { TxDropdownOption } from '@app/shared/components/forms/tx-dropdown/tx-dropdown.types';
import { TxFormFieldComponent } from '@app/shared/components/forms/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/forms/tx-input/tx-input.component';
import { TxTagComponent } from '@app/shared/components/forms/tx-tag/tx-tag.component';
import { TxTextareaComponent } from '@app/shared/components/forms/tx-textarea/tx-textarea.component';
import { TxToggleComponent } from '@app/shared/components/forms/tx-toggle/tx-toggle.component';

import { DevToolClipboardService } from '../shell/dev-tool-clipboard.service';
import { DevToolLayoutComponent } from '../shell/dev-tool-layout.component';
import { DevToolModeChipComponent } from '../shell/dev-tool-mode-chip.component';
import { DevToolStatStripComponent } from '../shell/dev-tool-stat-strip.component';
import { DevToolToolbarComponent } from '../shell/dev-tool-toolbar.component';
import { createDevToolStateBinding } from './dev-tool-session.harness';
import {
  assembleJwtClaims,
  JWT_ALGORITHM_OPTIONS,
  JWT_TTL_PRESETS,
} from './logic/jwt-claims';
import {
  addJwtProfile,
  deleteActiveJwtProfile,
  duplicateJwtProfile,
  findActiveJwtProfile,
  patchActiveJwtProfile,
} from './logic/jwt-profiles';
import {
  decodeJwt,
  generateJwt,
  splitJwt,
  validateJwt,
  type JwtValidateIssue,
} from './logic/jwt.logic';

@Component({
  selector: 'app-jwt-dev-tool',
  standalone: true,
  imports: [
    FormsModule,
    DevToolLayoutComponent,
    DevToolToolbarComponent,
    DevToolModeChipComponent,
    DevToolStatStripComponent,
    TxBannerComponent,
    TxButtonComponent,
    TxCodeEditorComponent,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxInputComponent,
    TxTextareaComponent,
    TxTagComponent,
    TxToggleComponent,
  ],
  templateUrl: './jwt-dev-tool.component.html',
  styleUrl: './jwt-dev-tool.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JwtDevToolComponent {
  private readonly clipboard = inject(DevToolClipboardService);
  private readonly environmentsService = inject(EnvironmentsService);
  private readonly notifications = inject(TxNotificationService);
  private readonly fileDialog = inject(FileDialogService);

  protected readonly state = createDevToolStateBinding('jwt');

  /** Inline HMAC/PEM/JWK secret — memory only, never persisted. */
  protected readonly inlineSecret = signal('');

  protected readonly actionError = signal<string | null>(null);
  protected readonly validateIssues = signal<readonly JwtValidateIssue[]>([]);
  protected readonly validateOk = signal<boolean | null>(null);
  protected readonly generatedToken = signal('');
  protected readonly insertVariableKey = signal('JWT_TOKEN');

  protected readonly algorithmOptions: readonly TxDropdownOption<JwtAlgorithm>[] =
    JWT_ALGORITHM_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }));

  protected readonly secretSourceOptions: readonly TxDropdownOption<JwtSecretSource>[] = [
    { value: 'inline', label: 'Type it in (not saved)' },
    { value: 'file', label: 'Key / secret file on disk' },
    { value: 'envVar', label: 'Environment variable' },
  ];

  protected readonly ttlPresetOptions: readonly TxDropdownOption[] = [
    ...JWT_TTL_PRESETS.map((preset) => ({
      value: String(preset.ttlSec),
      label: preset.label,
    })),
    { value: 'custom', label: 'Custom (seconds)' },
  ];

  protected readonly activeProfile = computed(() => findActiveJwtProfile(this.state()));

  protected readonly modeTitle = computed(() => {
    switch (this.state().mode) {
      case 'generate':
        return 'Generate a signed JWT';
      case 'decode':
        return 'Decode a JWT';
      case 'validate':
        return 'Validate a JWT';
    }
  });

  protected readonly modeDescription = computed(() => {
    switch (this.state().mode) {
      case 'generate':
        return 'Pick a signing profile, fill claims, and sign with HS/RS/ES. Profiles remember algorithm, key location, and default claims — never the secret itself.';
      case 'decode':
        return 'Paste any JWT to inspect its header and payload. Decoding does not check the signature.';
      case 'validate':
        return 'Verify the signature and claim rules (issuer, audience, required claims, expiry) using the active profile’s key.';
    }
  });

  protected readonly profileOptions = computed((): readonly TxDropdownOption[] =>
    this.state().profiles.map((profile) => ({
      value: profile.id,
      label: profile.name,
    })),
  );

  protected readonly environmentOptions = computed((): readonly TxDropdownOption[] =>
    buildCollectionEnvironmentDropdownOptions(this.environmentsService.environments(), {
      includeInherit: false,
    }),
  );

  protected readonly environmentDropdownValue = computed(
    () => this.activeProfile()?.environmentId?.trim() || COLLECTION_ENVIRONMENT_NONE,
  );

  /** Variables from the profile’s selected environment. */
  protected readonly envVarOptions = computed((): readonly TxDropdownOption[] => {
    const environmentId = this.activeProfile()?.environmentId?.trim();
    if (!environmentId) {
      return [{ value: '', label: 'Select an environment first', disabled: true }];
    }
    const environment = this.environmentsService
      .environments()
      .find((entry) => entry.id === environmentId);
    if (!environment) {
      return [{ value: '', label: 'Environment not found', disabled: true }];
    }
    const keys = collectEnvironmentVariables(environment.nodes).map((entry) => ({
      value: entry.key,
      label: entry.key,
    }));
    if (keys.length === 0) {
      return [{ value: '', label: 'No variables in this environment', disabled: true }];
    }
    return keys;
  });

  protected readonly preview = computed(() => {
    const profile = this.activeProfile();
    if (!profile) {
      return null;
    }
    return assembleJwtClaims(profile, { preview: true });
  });

  protected readonly decoded = computed(() => decodeJwt(this.state().token));

  protected readonly parts = computed(() => splitJwt(this.state().token));

  protected readonly ttlPresetValue = computed(() => {
    const ttl = this.activeProfile()?.ttlSec ?? 3_600;
    return JWT_TTL_PRESETS.some((preset) => preset.ttlSec === ttl) ? String(ttl) : 'custom';
  });

  protected readonly outputToken = computed(
    () => this.generatedToken() || (this.state().mode === 'generate' ? this.state().token : ''),
  );

  protected setMode(mode: JwtToolMode): void {
    this.state.update((s) => ({ ...s, mode }));
    this.actionError.set(null);
    this.validateOk.set(null);
    this.validateIssues.set([]);
  }

  protected handleProfileSelect(profileId: string): void {
    this.state.update((s) => ({ ...s, activeProfileId: profileId }));
    this.actionError.set(null);
    this.validateOk.set(null);
  }

  protected handleAddProfile(): void {
    this.state.update((s) => addJwtProfile(s));
  }

  protected handleDuplicateProfile(): void {
    this.state.update((s) => duplicateJwtProfile(s));
  }

  protected handleDeleteProfile(): void {
    this.state.update((s) => deleteActiveJwtProfile(s));
  }

  protected patchProfile(patch: Partial<Omit<JwtSigningProfile, 'id'>>): void {
    this.state.update((s) => patchActiveJwtProfile(s, patch));
  }

  protected handleEnvironmentChange(value: string): void {
    const environmentId =
      !value || value === COLLECTION_ENVIRONMENT_NONE ? undefined : value;
    this.patchProfile({ environmentId, secretEnvVarKey: '' });
  }

  protected handleTtlPresetChange(value: string): void {
    if (value === 'custom') {
      return;
    }
    const ttlSec = Number(value);
    if (Number.isFinite(ttlSec)) {
      this.patchProfile({ ttlSec });
    }
  }

  protected handleTtlCustomChange(raw: string): void {
    const ttlSec = Math.max(0, Math.floor(Number(raw) || 0));
    this.patchProfile({ ttlSec });
  }

  protected async handlePickSecretFile(): Promise<void> {
    const picked = await this.fileDialog.pickFile(['pem', 'key', 'jwk', 'json', 'txt']);
    if (!picked) {
      return;
    }
    this.patchProfile({
      secretSource: 'file',
      secretFilePath: picked.filePath,
      secretFileName: picked.fileName,
    });
  }

  protected async resolveSecretMaterial(): Promise<string | null> {
    const profile = this.activeProfile();
    if (!profile) {
      this.actionError.set('Create a signing profile first.');
      return null;
    }

    if (profile.secretSource === 'inline') {
      const secret = this.inlineSecret().trim();
      if (!secret) {
        this.actionError.set('Enter a signing secret or key (kept in memory only).');
        return null;
      }
      return secret;
    }

    if (profile.secretSource === 'file') {
      if (!profile.secretFilePath.trim()) {
        this.actionError.set('Pick a secret or key file for this profile.');
        return null;
      }
      const file = await this.fileDialog.readTextFile(profile.secretFilePath);
      if (!file?.content?.trim()) {
        this.actionError.set('Could not read the secret file. Check the path still exists.');
        return null;
      }
      return file.content;
    }

    const key = profile.secretEnvVarKey.trim();
    const environmentId = profile.environmentId?.trim();
    if (!environmentId) {
      this.actionError.set('Select an environment for the env-var secret source.');
      return null;
    }
    if (!key) {
      this.actionError.set('Select an environment variable that holds the signing secret.');
      return null;
    }
    const environment = this.environmentsService
      .environments()
      .find((entry) => entry.id === environmentId);
    if (!environment) {
      this.actionError.set('The linked environment was not found.');
      return null;
    }
    const match = collectEnvironmentVariables(environment.nodes).find((entry) => entry.key === key);
    if (!match?.value?.trim()) {
      this.actionError.set(`Environment variable "${key}" is empty or missing.`);
      return null;
    }
    return match.value;
  }

  protected async handleGenerate(): Promise<string | null> {
    const profile = this.activeProfile();
    if (!profile) {
      return null;
    }
    const assembled = assembleJwtClaims(profile);
    if (assembled.error) {
      this.actionError.set(assembled.error);
      return null;
    }
    const secret = await this.resolveSecretMaterial();
    if (secret === null) {
      return null;
    }

    const result = await generateJwt({
      alg: profile.alg,
      secretMaterial: secret,
      payload: assembled.payload,
      typ: profile.typ,
      kid: profile.kid,
    });
    this.actionError.set(result.error);
    this.generatedToken.set(result.token);
    if (result.token) {
      this.state.update((s) => ({ ...s, token: result.token }));
      return result.token;
    }
    return null;
  }

  protected async handleGenerateAndCopy(): Promise<void> {
    const token = await this.handleGenerate();
    if (!token) {
      return;
    }
    await this.copyTokenText(token);
  }

  protected async handleValidate(): Promise<void> {
    const profile = this.activeProfile();
    if (!profile) {
      return;
    }
    const secret = await this.resolveSecretMaterial();
    if (secret === null) {
      return;
    }

    const result = await validateJwt(this.state().token, {
      alg: profile.alg,
      secretMaterial: secret,
      clockToleranceSec: profile.clockToleranceSec,
      issuer: profile.expectIss.trim() || undefined,
      audience: profile.expectAud.trim() || undefined,
      requiredClaims: profile.requiredClaims,
    });
    this.validateOk.set(result.valid);
    this.validateIssues.set(result.issues);
    this.actionError.set(null);
  }

  protected handleSendTo(mode: 'decode' | 'validate'): void {
    const token = this.generatedToken() || this.state().token;
    if (token.trim()) {
      this.state.update((s) => ({ ...s, token, mode }));
    } else {
      this.setMode(mode);
    }
    this.validateOk.set(null);
    this.validateIssues.set([]);
  }

  protected handleClear(): void {
    this.state.update((s) => ({ ...s, token: '' }));
    this.inlineSecret.set('');
    this.generatedToken.set('');
    this.actionError.set(null);
    this.validateOk.set(null);
    this.validateIssues.set([]);
  }

  protected async handleCopyToken(): Promise<void> {
    const text =
      this.state().mode === 'generate'
        ? this.generatedToken() || this.state().token
        : this.state().token;
    await this.copyTokenText(text);
  }

  protected handleInsertTokenIntoEnvironment(): void {
    const token = (this.generatedToken() || this.state().token).trim();
    const environmentId = this.activeProfile()?.environmentId?.trim();
    const key = this.insertVariableKey().trim();
    if (!token) {
      this.actionError.set('Generate or paste a token first.');
      return;
    }
    if (!environmentId) {
      this.actionError.set('Select an environment on this profile.');
      return;
    }
    if (!key) {
      this.actionError.set('Enter a variable name to insert into.');
      return;
    }
    const ok = this.environmentsService.upsertVariableByKey(environmentId, key, token);
    if (ok) {
      this.actionError.set(null);
      this.notifications.showSuccess(`Saved token to ${key}`);
      return;
    }
    this.actionError.set('Could not write the token to the selected environment.');
  }

  private async copyTokenText(token: string): Promise<void> {
    const trimmed = token.trim();
    if (!trimmed) {
      return;
    }
    const withBearer = this.state().copyWithBearerPrefix;
    const text = withBearer ? `Bearer ${trimmed}` : trimmed;
    await this.clipboard.copy(text, withBearer ? 'Bearer token copied' : 'Token copied');
  }

  protected async handleCopySignature(): Promise<void> {
    const sig = this.parts()?.signature;
    if (sig) {
      await this.clipboard.copy(sig, 'Signature copied');
    }
  }

  protected async handleCopyHeader(): Promise<void> {
    await this.clipboard.copy(this.decoded().headerJson, 'Header copied');
  }

  protected async handleCopyPayload(): Promise<void> {
    await this.clipboard.copy(this.decoded().payloadJson, 'Payload copied');
  }

  protected requiredClaimsText(): string {
    return (this.activeProfile()?.requiredClaims ?? []).join(', ');
  }

  protected handleRequiredClaimsChange(raw: string): void {
    const requiredClaims = raw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .slice(0, 32);
    this.patchProfile({ requiredClaims });
  }

  protected handleNbfOffsetChange(raw: string): void {
    this.patchProfile({ nbfOffsetSec: Math.max(0, Math.floor(Number(raw) || 0)) });
  }

  protected handleClockToleranceChange(raw: string): void {
    this.patchProfile({ clockToleranceSec: Math.max(0, Math.floor(Number(raw) || 0)) });
  }
}
