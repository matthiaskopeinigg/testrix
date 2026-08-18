import { Injectable, inject } from '@angular/core';

import {
  buildCollectionSettingsPatchFromCapture,
  buildRequestStepConfigFromCapture,
  buildValidationStepConfigFromCapture,
  captureEntryRequestLabel,
  captureFlowNameFromEntry,
  coerceCaptureHttpMethod,
  generateCollectionRequestsFromCapture,
  generateMockEndpointsFromCapture,
  generateOpenApiFromCapture,
  dedupeCaptureEntriesByMethodPath,
  type CaptureLogEntry,
} from '@shared/testing';
import { parseTestSuiteTabResourceId, mockServerTabResourceId, testSuiteTabResourceId } from '@shared/testing';
import { importOpenApiToMockEndpoints } from '@shared/import-export';

import { CollectionsService } from '@app/core/collections/collections.service';
import { DevelopmentSessionService } from '@app/core/development/development-session.service';
import { ErrorNotificationService } from '@app/core/errors/error-notification.service';
import { TxNotificationService } from '@app/core/notifications/tx-notification.service';
import { MockServerService } from '@app/core/testing/mock-server.service';
import { TestSuiteService } from '@app/core/testing/test-suite.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';

/**
 * Creates collection requests and test-suite flows from captured HTTP traffic.
 */
@Injectable({ providedIn: 'root' })
export class CaptureEntryActionsService {
  private readonly collections = inject(CollectionsService);
  private readonly testSuite = inject(TestSuiteService);
  private readonly mockServer = inject(MockServerService);
  private readonly developmentSession = inject(DevelopmentSessionService);
  private readonly workspaceEditor = inject(WorkspaceEditorService);
  private readonly notifier = inject(ErrorNotificationService);
  private readonly notifications = inject(TxNotificationService);

  /**
   * Adds a new collection request from a capture entry and opens its workspace tab.
   */
  createCollectionRequest(entry: CaptureLogEntry): string | null {
    if (!this.collections.nodes().length) {
      this.notifier.reportUnknown(
        new Error('Add a collection folder or request first, then create a request from capture.'),
      );
      return null;
    }

    const method = coerceCaptureHttpMethod(entry.method);
    const url = (entry.url || '').trim() || '/';
    const label = captureEntryRequestLabel(entry);
    const requestId = this.collections.createRequest(null, label);
    if (!requestId) {
      this.notifier.reportUnknown(new Error('Could not create a collection request from capture.'));
      return null;
    }

    this.collections.updateRequest(requestId, { method, url, label });
    this.collections.patchRequestSettings(requestId, buildCollectionSettingsPatchFromCapture(entry));
    this.workspaceEditor.openResource({ resourceId: requestId, kind: 'request' });
    return requestId;
  }

  /**
   * Creates a new flow with a REQUEST step and a VALIDATION step seeded from the capture entry.
   */
  createFlowFromCapture(entry: CaptureLogEntry): string | null {
    if (!this.testSuite.rootSuite()) {
      this.notifier.reportUnknown(
        new Error('Test suite is not loaded. Open the Test Suite panel and try again.'),
      );
      return null;
    }

    const flowName = captureFlowNameFromEntry(entry);
    const flow = this.testSuite.addFlow(flowName, this.resolveFlowParentId());
    if (!flow) {
      this.notifier.reportUnknown(new Error('Could not create a test suite flow from capture.'));
      return null;
    }

    const requestLabel = captureEntryRequestLabel(entry);
    const requestStep = this.testSuite.addFlowStep(flow.id, 'REQUEST', null, requestLabel);
    if (!requestStep) {
      this.notifier.reportUnknown(new Error('Could not add a request step to the new flow.'));
      return null;
    }

    this.testSuite.updateFlowStep(flow.id, requestStep.id, {
      name: requestLabel,
      config: buildRequestStepConfigFromCapture(entry),
    });

    const validationStep = this.testSuite.addFlowStep(flow.id, 'VALIDATION', null, 'Validate response');
    if (!validationStep) {
      this.notifier.reportUnknown(new Error('Could not add a validation step to the new flow.'));
      return null;
    }

    this.testSuite.updateFlowStep(flow.id, validationStep.id, {
      name: 'Validate response',
      config: buildValidationStepConfigFromCapture(entry, requestStep.id),
    });

    this.workspaceEditor.openResource({
      resourceId: testSuiteTabResourceId('flow', flow.id),
      kind: 'test-suite',
    });
    return flow.id;
  }

  /**
   * Creates one flow of REQUEST + VALIDATION pairs from selected capture rows
   * (deduped by method+path).
   */
  generateFlowFromCapture(entries: readonly CaptureLogEntry[]): string | null {
    if (!this.testSuite.rootSuite()) {
      this.notifier.reportUnknown(
        new Error('Test suite is not loaded. Open the Test Suite panel and try again.'),
      );
      return null;
    }
    const unique = dedupeCaptureEntriesByMethodPath(entries);
    if (unique.length === 0) {
      this.notifier.reportUnknown(new Error('Select captured requests to generate a flow.'));
      return null;
    }
    const flowName =
      unique.length === 1 ? captureFlowNameFromEntry(unique[0]!) : `From capture (${unique.length})`;
    const flow = this.testSuite.addFlow(flowName, this.resolveFlowParentId());
    if (!flow) {
      this.notifier.reportUnknown(new Error('Could not create a test suite flow from capture.'));
      return null;
    }
    for (const entry of unique) {
      const requestLabel = captureEntryRequestLabel(entry);
      const requestStep = this.testSuite.addFlowStep(flow.id, 'REQUEST', null, requestLabel);
      if (!requestStep) {
        continue;
      }
      this.testSuite.updateFlowStep(flow.id, requestStep.id, {
        name: requestLabel,
        config: buildRequestStepConfigFromCapture(entry),
      });
      const validationStep = this.testSuite.addFlowStep(flow.id, 'VALIDATION', null, 'Validate response');
      if (!validationStep) {
        continue;
      }
      this.testSuite.updateFlowStep(flow.id, validationStep.id, {
        name: 'Validate response',
        config: buildValidationStepConfigFromCapture(entry, requestStep.id),
      });
    }
    this.workspaceEditor.openResource({
      resourceId: testSuiteTabResourceId('flow', flow.id),
      kind: 'test-suite',
    });
    this.notifications.showSuccess(
      `Created a flow with ${unique.length} request${unique.length === 1 ? '' : 's'} from capture.`,
    );
    return flow.id;
  }

  /**
   * Creates a collection folder of unique method+path requests from selected capture rows.
   */
  generateCollectionFromCapture(entries: readonly CaptureLogEntry[]): string | null {
    const drafts = generateCollectionRequestsFromCapture(entries);
    if (drafts.length === 0) {
      this.notifier.reportUnknown(new Error('Select captured requests to generate a collection.'));
      return null;
    }
    const folderId = this.collections.createFolder(null, 'From capture');
    if (!folderId) {
      this.notifier.reportUnknown(new Error('Could not create a collection folder from capture.'));
      return null;
    }
    for (const draft of drafts) {
      const requestId = this.collections.createRequest(folderId, draft.label);
      if (!requestId) {
        continue;
      }
      this.collections.updateRequest(requestId, {
        method: draft.method,
        url: draft.url,
        label: draft.label,
      });
      this.collections.patchRequestSettings(requestId, draft.settings);
    }
    this.workspaceEditor.openResource({ resourceId: folderId, kind: 'folder' });
    this.notifications.showSuccess(`Created ${drafts.length} request${drafts.length === 1 ? '' : 's'} from capture.`);
    return folderId;
  }

  /**
   * Opens the OpenAPI development tool with a spec generated from capture rows.
   */
  generateOpenApiFromCapture(entries: readonly CaptureLogEntry[]): boolean {
    if (entries.length === 0) {
      this.notifier.reportUnknown(new Error('Select captured requests to generate OpenAPI.'));
      return false;
    }
    const content = generateOpenApiFromCapture(entries);
    this.developmentSession.patchToolState('openapi', {
      content,
      format: 'json',
      section: 'editor',
    });
    this.workspaceEditor.openResource({ resourceId: 'openapi', kind: 'dev-tool' });
    this.notifications.showSuccess('Opened generated OpenAPI spec.');
    return true;
  }

  /**
   * Creates mock endpoints from captured traffic.
   */
  async generateMockEndpointsFromCapture(entries: readonly CaptureLogEntry[]): Promise<number> {
    const endpoints = generateMockEndpointsFromCapture(entries);
    if (endpoints.length === 0) {
      this.notifier.reportUnknown(new Error('Select captured requests to generate mock endpoints.'));
      return 0;
    }
    await this.mockServer.hydrate();
    this.mockServer.appendEndpoints(endpoints);
    const first = endpoints[0];
    if (first) {
      this.workspaceEditor.openResource({
        resourceId: mockServerTabResourceId(first.id),
        kind: 'mock-server',
      });
    }
    this.notifications.showSuccess(
      `Created ${endpoints.length} mock endpoint${endpoints.length === 1 ? '' : 's'} from capture.`,
    );
    return endpoints.length;
  }

  /**
   * Creates mock endpoints from an OpenAPI document (response examples).
   */
  async generateMockEndpointsFromOpenApi(raw: string): Promise<number> {
    const endpoints = importOpenApiToMockEndpoints(raw);
    if (endpoints.length === 0) {
      this.notifier.reportUnknown(new Error('No OpenAPI operations found to mock.'));
      return 0;
    }
    await this.mockServer.hydrate();
    this.mockServer.appendEndpoints(endpoints);
    this.notifications.showSuccess(
      `Created ${endpoints.length} mock endpoint${endpoints.length === 1 ? '' : 's'} from OpenAPI.`,
    );
    return endpoints.length;
  }

  /** When a suite folder tab is active, new flows are created inside that folder. */
  private resolveFlowParentId(): string | undefined {
    const tab = this.workspaceEditor.activeTab();
    if (tab?.kind !== 'test-suite') {
      return undefined;
    }
    const parsed = parseTestSuiteTabResourceId(tab.resourceId);
    return parsed?.kind === 'folder' ? parsed.id : undefined;
  }
}
