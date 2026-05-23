import { Injectable, inject } from '@angular/core';

import {
  buildCollectionSettingsPatchFromCapture,
  buildRequestStepConfigFromCapture,
  buildValidationStepConfigFromCapture,
  captureEntryRequestLabel,
  captureFlowNameFromEntry,
  coerceCaptureHttpMethod,
  type CaptureLogEntry,
} from '@shared/testing';
import { parseTestSuiteTabResourceId, testSuiteTabResourceId } from '@shared/testing';

import { CollectionsService } from '@app/core/collections/collections.service';
import { ErrorNotificationService } from '@app/core/errors/error-notification.service';
import { TestSuiteService } from '@app/core/testing/test-suite.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';

/**
 * Creates collection requests and test-suite flows from captured HTTP traffic.
 */
@Injectable({ providedIn: 'root' })
export class CaptureEntryActionsService {
  private readonly collections = inject(CollectionsService);
  private readonly testSuite = inject(TestSuiteService);
  private readonly workspaceEditor = inject(WorkspaceEditorService);
  private readonly notifier = inject(ErrorNotificationService);

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
