import { Injectable, computed, inject, signal } from '@angular/core';

import type {
  CollectionNode,
  CollectionRequestExample,
  CollectionRequestSavedSnapshot,
} from '@shared/config';
import type { HttpResponseSnapshot } from '@shared/http/outgoing-request.schema';
import type { ResponseDiffResult } from '@shared/http/response-diff';
import { buildOutgoingRequest } from '@shared/http/build-outgoing-request';
import {
  createFailedHttpResponseSnapshot,
  resolveHttpErrorMessage,
} from '@shared/http/http-failed-response';
import { sendHttpRequestPayloadSchema } from '@shared/http/outgoing-request.schema';
import {
  compareResponseSnapshots,
  type CompareResponseOptions,
} from '@shared/http/response-diff';
import { resolveResponseTabAfterSend } from '@shared/http/resolve-response-tab-after-send';
import {
  resolveRequestRunSession,
  type RequestResponseTabId,
} from '@shared/config/request-runs-session.schema';
import { fromTreeNodes } from '@app/features/shell/collections/collection-tree.adapter';
import { findCollectionNode } from '@app/features/shell/collections/collection-tree.mutations';
import {
  createDefaultEnvironments,
  findCollectionRequestInTree,
  resolveCollectionRequestEnvironmentId,
  type EnvironmentDefinition,
  type EnvironmentVariableKeyOptions,
} from '@shared/config';
import type { DynamicVariableCatalogItem } from '@shared/dynamic-variables';
import { buildCollectionVariableCatalog } from '@app/features/shell/workspace/request-workspace-tab/request-variable-catalog';

import { CollectionsService } from '../collections/collections.service';
import { ConfigService } from '../config/config.service';
import { EnvironmentsService } from '../environments/environments.service';
import { ElectronService } from '../electron/electron.service';
import { ErrorNotificationService } from '../errors/error-notification.service';
import { HistoryService } from '../history/history.service';

const MAX_RUNS = 20;

@Injectable({ providedIn: 'root' })
export class HttpRequestService {
  private readonly electron = inject(ElectronService);
  private readonly configService = inject(ConfigService);
  private readonly collectionsService = inject(CollectionsService);
  private readonly environmentsService = inject(EnvironmentsService);
  private readonly historyService = inject(HistoryService);
  private readonly notifier = inject(ErrorNotificationService);

  private readonly inFlightState = signal(false);
  private readonly activeRequestId = signal<string | null>(null);
  private readonly runsByRequest = signal<Record<string, HttpResponseSnapshot[]>>({});
  private readonly selectedRunId = signal<string | null>(null);
  private readonly lastDiffState = signal<ResponseDiffResult | null>(null);
  private readonly manualDiffState = signal<ResponseDiffResult | null>(null);
  private readonly diffCompareOptions = signal<CompareResponseOptions>({ normalizeJson: true });
  /** Script-updated values per environment profile (post-response `pm.environment.set`). */
  private readonly sessionVariablesByEnvironmentId = signal<
    Readonly<Record<string, Readonly<Record<string, string>>>>
  >({});

  /** Keys cached by scripts for the active environment (autocomplete in auth/headers). */
  sessionVariableKeys(environmentId: string | null): readonly string[] {
    if (!environmentId) {
      return [];
    }
    return Object.keys(this.sessionVariablesByEnvironmentId()[environmentId] ?? {});
  }

  /** All script-cached keys across every environment profile in this session. */
  allSessionVariableKeys(): readonly string[] {
    const keys = new Set<string>();
    for (const map of Object.values(this.sessionVariablesByEnvironmentId())) {
      for (const key of Object.keys(map)) {
        keys.add(key);
      }
    }
    return [...keys];
  }

  /**
   * Variable catalog for workspace inputs: `$` dynamics, environment `{{keys}}`, and script session cache.
   */
  buildVariableCatalog(
    environment: EnvironmentDefinition | null | undefined,
    keyOptions: EnvironmentVariableKeyOptions,
    environmentId: string | null = null,
    extraKeys: readonly string[] = [],
  ): readonly DynamicVariableCatalogItem[] {
    const scopedKeys = environmentId ? this.sessionVariableKeys(environmentId) : [];
    const sessionKeys = [...new Set([...scopedKeys, ...this.allSessionVariableKeys(), ...extraKeys])];
    return buildCollectionVariableCatalog(environment, keyOptions, sessionKeys);
  }

  private sessionVariableOverrides(environmentId: string | null): Readonly<Record<string, string>> {
    if (!environmentId) {
      return {};
    }
    return this.sessionVariablesByEnvironmentId()[environmentId] ?? {};
  }

  private mergeSessionVariables(
    environmentId: string | null,
    patch: Readonly<Record<string, string>>,
  ): void {
    if (!environmentId) {
      return;
    }
    const keys = Object.entries(patch).filter(([key, value]) => key.trim() && value !== undefined);
    if (keys.length === 0) {
      return;
    }
    this.sessionVariablesByEnvironmentId.update((current) => {
      const prev = current[environmentId] ?? {};
      const next = { ...prev };
      for (const [key, value] of keys) {
        next[key] = value;
      }
      return { ...current, [environmentId]: next };
    });
  }

  private resolveEffectiveEnvironmentId(requestId: string): string | null {
    const loc = findCollectionRequestInTree(this.collectionNodes(), requestId);
    if (!loc) {
      return null;
    }
    return resolveCollectionRequestEnvironmentId(
      loc.request.settings.environmentId,
      loc.ancestorFolders,
    );
  }

  readonly inFlight = computed(() => this.inFlightState());
  readonly selectedSnapshot = computed(() => {
    const requestId = this.activeRequestId();
    const runId = this.selectedRunId();
    if (!requestId || !runId) {
      return null;
    }
    return this.runsByRequest()[requestId]?.find((r) => r.id === runId) ?? null;
  });
  readonly runs = computed(() => {
    const requestId = this.activeRequestId();
    if (!requestId) {
      return [];
    }
    return this.runsByRequest()[requestId] ?? [];
  });
  readonly lastDiff = computed(() => this.manualDiffState() ?? this.lastDiffState());
  readonly pinnedBaselineId = computed(() => {
    const requestId = this.activeRequestId();
    if (!requestId) {
      return null;
    }
    return this.runSession(requestId).pinnedBaselineId;
  });

  runSession(requestId: string) {
    return resolveRequestRunSession(
      this.configService.session()?.workspace.collections.requestRunsById,
      requestId,
    );
  }

  activeResponseTab(requestId: string): RequestResponseTabId {
    return this.runSession(requestId).activeResponseTab;
  }

  isResponsePanelHidden(requestId: string): boolean {
    return this.runSession(requestId).isResponsePanelHidden;
  }

  /** Resource id currently bound to the HTTP runner (active request tab). */
  boundRequestId(): string | null {
    return this.activeRequestId();
  }

  /** Binds run timeline to a request tab resource id. */
  bindRequest(requestId: string): void {
    if (this.activeRequestId() === requestId) {
      return;
    }
    this.activeRequestId.set(requestId);
    const persisted = this.runSession(requestId);
    if (persisted.runs.length > 0) {
      this.runsByRequest.update((map) => ({
        ...map,
        [requestId]: [...persisted.runs],
      }));
      this.selectedRunId.set(persisted.runs[0]?.id ?? null);
    }
    this.recomputeDiff();
  }

  async setActiveResponseTab(requestId: string, tab: RequestResponseTabId): Promise<void> {
    await this.patchRunSession(requestId, { activeResponseTab: tab });
  }

  async setResponsePanelHidden(requestId: string, hidden: boolean): Promise<void> {
    await this.patchRunSession(requestId, { isResponsePanelHidden: hidden });
  }

  selectRun(runId: string): void {
    this.selectedRunId.set(runId);
    this.manualDiffState.set(null);
    const requestId = this.activeRequestId();
    if (requestId) {
      const session = this.runSession(requestId);
      if (session.compareSelection) {
        void this.patchRunSession(requestId, {
          compareSelection: { a: session.compareSelection.a, b: runId },
        });
      }
    }
    this.recomputeDiff();
  }

  compareRuns(aId: string, bId: string): void {
    const requestId = this.activeRequestId();
    if (!requestId) {
      return;
    }
    const a = this.resolveSnapshotById(requestId, aId);
    const b = this.resolveSnapshotById(requestId, bId);
    if (!a || !b) {
      return;
    }
    this.manualDiffState.set(this.compareSnapshots(a, b));
    void this.patchRunSession(requestId, { compareSelection: { a: aId, b: bId } });
  }

  setDiffCompareOptions(patch: Partial<CompareResponseOptions>): void {
    this.diffCompareOptions.update((prev) => ({ ...prev, ...patch }));
    this.refreshDiff();
  }

  async executeCollectionRequest(requestId: string): Promise<HttpResponseSnapshot | null> {
    const api = this.electron.bridge();
    if (!api?.http) {
      this.notifier.reportUnknown(new Error('HTTP send requires the Electron desktop app.'));
      return null;
    }

    const settings = this.configService.settings();
    const http = settings?.http;
    if (!http) {
      return null;
    }

    const nodes = this.collectionNodes();
    const environmentId = this.resolveEffectiveEnvironmentId(requestId);
    const built = buildOutgoingRequest({
      requestId,
      nodes,
      http,
      environments: this.environmentsFile(),
      appVersion: api.versions.app || '0.0.0',
      environmentVariableKeys: {
        useFolderPathInKeys: settings.environments.useFolderPathInKeys,
      },
      runScope: {
        runId: `run-${Date.now()}`,
        sharedVariables: this.sessionVariableOverrides(environmentId),
      },
    });

    if (!built) {
      const loc = findCollectionNode(this.collectionsService.nodes(), requestId);
      const rawUrl = loc?.node.data?.url?.trim() ?? '';
      this.notifier.reportUnknown(
        new Error(
          rawUrl
            ? 'Request could not be built. Check URL, auth, and transport settings.'
            : 'Enter a URL before sending.',
        ),
      );
      return null;
    }

    this.inFlightState.set(true);
    this.activeRequestId.set(requestId);
    this.manualDiffState.set(null);

    const payload = {
      ...built.outgoing,
      runScope: {
        runId: `run-${Date.now()}`,
        sharedVariables: this.sessionVariableOverrides(built.outgoing.environmentId),
      },
    };
    const payloadCheck = sendHttpRequestPayloadSchema.safeParse(payload);
    if (!payloadCheck.success) {
      this.notifier.reportUnknown(
        new Error(
          `Request payload is invalid (${JSON.stringify(payloadCheck.error.flatten())}). Try reloading settings or fixing HTTP/DNS options in Settings.`,
        ),
      );
      return null;
    }

    try {
      const { snapshot, scriptVariablePatch } = await api.http.send(payloadCheck.data);

      if (scriptVariablePatch && built.outgoing.environmentId) {
        this.mergeSessionVariables(built.outgoing.environmentId, scriptVariablePatch);
      }

      this.pushRun(requestId, snapshot);
      this.selectedRunId.set(snapshot.id);
      await this.patchRunSession(requestId, {
        runs: this.runsByRequest()[requestId] ?? [],
        isResponsePanelHidden: false,
      });
      this.recomputeDiff();

      const session = this.runSession(requestId);
      const runCount = this.runsByRequest()[requestId]?.length ?? 0;
      const defaultTabOnSend =
        settings.http.request.defaultResponseTabOnSend ?? 'body';
      const tab = resolveResponseTabAfterSend({
        currentTab: session.activeResponseTab,
        pinnedBaselineId: session.pinnedBaselineId,
        snapshot,
        runCount,
        defaultTabOnSend,
      });
      await this.setActiveResponseTab(requestId, tab);

      this.historyService.appendFromSend({
        requestId,
        snapshot,
        outgoing: payloadCheck.data,
        label:
          findCollectionNode(this.collectionsService.nodes(), requestId)?.node.label ?? requestId,
      });
      return snapshot;
    } catch (error: unknown) {
      const message = resolveHttpErrorMessage(error);
      const failed = createFailedHttpResponseSnapshot(payloadCheck.data, message);
      this.pushRun(requestId, failed);
      this.selectedRunId.set(failed.id);
      await this.patchRunSession(requestId, {
        runs: this.runsByRequest()[requestId] ?? [],
        isResponsePanelHidden: false,
      });
      const session = this.runSession(requestId);
      const runCount = this.runsByRequest()[requestId]?.length ?? 0;
      const defaultTabOnSend =
        settings.http.request.defaultResponseTabOnSend ?? 'body';
      const tab = resolveResponseTabAfterSend({
        currentTab: session.activeResponseTab,
        pinnedBaselineId: session.pinnedBaselineId,
        snapshot: failed,
        runCount,
        defaultTabOnSend,
      });
      await this.setActiveResponseTab(requestId, tab);
      this.historyService.appendFromSend({
        requestId,
        snapshot: failed,
        outgoing: payloadCheck.data,
        label:
          findCollectionNode(this.collectionsService.nodes(), requestId)?.node.label ?? requestId,
      });
      return failed;
    } finally {
      this.inFlightState.set(false);
    }
  }

  saveExample(requestId: string, name: string): boolean {
    const snap = this.selectedSnapshot();
    if (!snap?.id) {
      return false;
    }
    const node = findCollectionNode(this.collectionsService.nodes(), requestId);
    const settings = node?.node.data?.requestSettings;
    if (!node || node.node.data?.kind !== 'request' || !settings) {
      return false;
    }
    const example: CollectionRequestExample = {
      id: globalThis.crypto?.randomUUID?.() ?? `ex-${Date.now()}`,
      name: name.trim() || 'Example',
      snapshot: { ...snap, id: snap.id },
    };
    return this.collectionsService.patchRequestSettings(requestId, {
      examples: [...settings.examples, example],
    });
  }

  /** Loads a saved example into the response viewer run list. */
  showExample(requestId: string, exampleId: string): boolean {
    const node = findCollectionNode(this.collectionsService.nodes(), requestId);
    const settings = node?.node.data?.requestSettings;
    if (!node || node.node.data?.kind !== 'request' || !settings) {
      return false;
    }
    const example = settings.examples.find((entry) => entry.id === exampleId);
    if (!example) {
      return false;
    }
    const snap = example.snapshot;
    const existing = this.runsByRequest()[requestId] ?? [];
    if (!existing.some((run) => run.id === snap.id)) {
      this.pushRun(requestId, { ...snap });
    }
    this.selectedRunId.set(snap.id);
    return true;
  }

  saveSnapshot(requestId: string, name: string): boolean {
    const snap = this.selectedSnapshot();
    if (!snap?.id) {
      return false;
    }
    const node = findCollectionNode(this.collectionsService.nodes(), requestId);
    const settings = node?.node.data?.requestSettings;
    if (!node || node.node.data?.kind !== 'request' || !settings) {
      return false;
    }
    const entry: CollectionRequestSavedSnapshot = {
      id: globalThis.crypto?.randomUUID?.() ?? `sn-${Date.now()}`,
      name: name.trim() || 'Snapshot',
      snapshot: { ...snap, id: snap.id },
    };
    return this.collectionsService.patchRequestSettings(requestId, {
      snapshots: [...settings.snapshots, entry],
    });
  }

  refreshDiff(): void {
    const requestId = this.activeRequestId();
    if (!requestId) {
      return;
    }
    const session = this.runSession(requestId);
    const compare = session.compareSelection;
    if (compare) {
      this.compareRuns(compare.a, compare.b);
      return;
    }
    this.manualDiffState.set(null);
    this.recomputeDiff();
  }

  pinBaseline(snapshotId: string): void {
    const requestId = this.activeRequestId();
    if (!requestId) {
      return;
    }
    this.manualDiffState.set(null);
    void this.patchRunSession(requestId, {
      pinnedBaselineId: snapshotId,
      compareSelection: null,
    });
    this.recomputeDiff();
  }

  private resolveSnapshotById(requestId: string, snapshotId: string): HttpResponseSnapshot | null {
    const fromRuns = this.runs().find((r) => r.id === snapshotId);
    if (fromRuns) {
      return fromRuns;
    }
    return this.findBaselineInSettings(requestId, snapshotId);
  }

  private recomputeDiff(): void {
    const requestId = this.activeRequestId();
    if (!requestId) {
      this.lastDiffState.set(null);
      return;
    }
    const current = this.selectedSnapshot();
    if (!current) {
      this.lastDiffState.set(null);
      return;
    }

    const session = this.runSession(requestId);
    const compare = session.compareSelection;
    if (compare) {
      const a = this.resolveSnapshotById(requestId, compare.a);
      const b = this.resolveSnapshotById(requestId, compare.b);
      if (a && b) {
        this.lastDiffState.set(this.compareSnapshots(a, b));
        return;
      }
    }

    let baselineId = session.pinnedBaselineId;
    if (!baselineId) {
      const runs = this.runs();
      const idx = runs.findIndex((r) => r.id === current.id);
      const previous = idx >= 0 && idx < runs.length - 1 ? runs[idx + 1] : null;
      if (previous) {
        this.lastDiffState.set(this.compareSnapshots(previous, current));
        return;
      }
      this.lastDiffState.set(null);
      return;
    }

    const baseline = this.resolveSnapshotById(requestId, baselineId);
    if (!baseline) {
      this.lastDiffState.set(null);
      return;
    }
    this.lastDiffState.set(this.compareSnapshots(baseline, current));
  }

  private compareSnapshots(
    a: HttpResponseSnapshot,
    b: HttpResponseSnapshot,
  ): ResponseDiffResult {
    return compareResponseSnapshots(a, b, this.diffCompareOptions());
  }

  private findBaselineInSettings(
    requestId: string,
    baselineId: string,
  ): HttpResponseSnapshot | null {
    const nodes = this.collectionNodes();
    const find = (list: CollectionNode[]): HttpResponseSnapshot | null => {
      for (const n of list) {
        if (n.kind === 'request' && n.id === requestId) {
          for (const ex of n.settings.examples) {
            if (ex.snapshot.id === baselineId || ex.id === baselineId) {
              return ex.snapshot;
            }
          }
          for (const sn of n.settings.snapshots) {
            if (sn.snapshot.id === baselineId || sn.id === baselineId) {
              return sn.snapshot;
            }
          }
        }
        if (n.kind === 'folder') {
          const f = find(n.children);
          if (f) {
            return f;
          }
        }
      }
      return null;
    };
    return find(nodes);
  }

  private async patchRunSession(
    requestId: string,
    patch: Partial<ReturnType<typeof resolveRequestRunSession>>,
  ): Promise<void> {
    const existing = this.runSession(requestId);
    await this.configService.patchSession({
      workspace: {
        collections: {
          requestRunsById: {
            [requestId]: {
              ...existing,
              ...patch,
            },
          },
        },
      },
    });
  }

  private pushRun(requestId: string, snapshot: HttpResponseSnapshot): void {
    this.runsByRequest.update((map) => {
      const prev = map[requestId] ?? [];
      return {
        ...map,
        [requestId]: [snapshot, ...prev].slice(0, MAX_RUNS),
      };
    });
  }

  private collectionNodes(): CollectionNode[] {
    return fromTreeNodes(this.collectionsService.nodes());
  }

  private environmentsFile() {
    const base = createDefaultEnvironments();
    return {
      ...base,
      environments: [...this.environmentsService.environments()],
    };
  }
}
