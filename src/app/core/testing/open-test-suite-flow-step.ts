import { resolveTestSuiteTabUi } from '@shared/config';
import { testSuiteTabResourceId } from '@shared/testing';

import type { ConfigService } from '@app/core/config/config.service';
import type { TestingSessionService } from '@app/core/testing/testing-session.service';
import type { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';

/**
 * Opens a Test Suite flow tab on the Steps section with `stepId` selected.
 */
export async function openTestSuiteFlowStep(
  workspaceEditor: WorkspaceEditorService,
  configService: ConfigService,
  testingSession: TestingSessionService,
  flowId: string,
  stepId: string,
): Promise<void> {
  const resourceId = testSuiteTabResourceId('flow', flowId);
  const session = configService.session();
  const current = resolveTestSuiteTabUi(session?.workspace.testing.testSuiteTabsById, resourceId);
  await configService.patchSession({
    workspace: {
      testing: {
        ...testingSession.navigationFields(),
        testSuiteTabsById: {
          [resourceId]: {
            ...current,
            selectedStepId: stepId,
            activeFlowSection: 'steps',
          },
        },
      },
    },
  });
  workspaceEditor.openResource({ resourceId, kind: 'test-suite' });
}
