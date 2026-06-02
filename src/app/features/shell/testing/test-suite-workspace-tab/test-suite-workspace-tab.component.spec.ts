import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { ConfigService } from '@app/core/config/config.service';
import { ElectronService } from '@app/core/electron/electron.service';
import { EnvironmentsService } from '@app/core/environments/environments.service';
import { ErrorNotificationService } from '@app/core/errors/error-notification.service';
import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';
import { TestingSessionService } from '@app/core/testing/testing-session.service';
import { TestSuiteService } from '@app/core/testing/test-suite.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { TxIconService } from '@app/shared/icons/tx-icon.service';
import { createDefaultSession, createDefaultSettings } from '@shared/config';
import { createFlowStep, testSuiteTabResourceId } from '@shared/testing';

import { TestSuiteWorkspaceTabComponent } from './test-suite-workspace-tab.component';

const FLOW_ID = 'flw-spec';
const REQUEST_STEP = createFlowStep('REQUEST', 'Get health');
REQUEST_STEP.id = 'step-req';

describe('TestSuiteWorkspaceTabComponent', () => {
  let fixture: ComponentFixture<TestSuiteWorkspaceTabComponent>;
  const sessionState = signal(createDefaultSession());

  beforeEach(async () => {
    sessionState.set(createDefaultSession());
    const flow = {
      id: FLOW_ID,
      name: 'Spec flow',
      description: '',
      tags: [],
      nodes: [REQUEST_STEP],
      lastRunStatus: 'never' as const,
      lastRunAt: null,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    await TestBed.configureTestingModule({
      imports: [TestSuiteWorkspaceTabComponent],
      providers: [
        {
          provide: TestingSessionService,
          useValue: {
            navigationFields: () => ({ activeView: 'test-suite', subpanel: 'menu' }),
          },
        },
        {
          provide: TestSuiteService,
          useValue: {
            findFlow: vi.fn().mockReturnValue(flow),
            findFolder: vi.fn(),
            flows: vi.fn().mockReturnValue([]),
            labelForResource: vi.fn().mockReturnValue('Spec flow'),
            findFlowStep: vi.fn().mockImplementation((_flowId: string, stepId: string) =>
              stepId === REQUEST_STEP.id ? REQUEST_STEP : null,
            ),
            patchFlow: vi.fn(),
            updateFlowStep: vi.fn(),
            deleteFlowNode: vi.fn(),
            addFlowStep: vi.fn().mockReturnValue({ id: 'step-new', stepType: 'WAIT' }),
            addFlowStepFolder: vi.fn(),
            applyFlowRunStatuses: vi.fn(),
            resolveFlowEnvironmentId: vi.fn().mockReturnValue(null),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            session: sessionState,
            settings: signal(createDefaultSettings()),
            sessionRevision: signal(0),
            patchSession: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: UiPreferencesService,
          useValue: {
            entranceStaggerEnabled: () => false,
            animationsEnabled: () => false,
          },
        },
        {
          provide: ElectronService,
          useValue: { bridge: () => null },
        },
        {
          provide: EnvironmentsService,
          useValue: { environments: vi.fn().mockReturnValue([]) },
        },
        {
          provide: ErrorNotificationService,
          useValue: { reportUnknown: vi.fn() },
        },
        {
          provide: WorkspaceEditorService,
          useValue: { openResource: vi.fn() },
        },
        {
          provide: TxIconService,
          useValue: {
            loadIconInner: () => Promise.resolve('<path d="M6 6l12 12"/>'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TestSuiteWorkspaceTabComponent);
    fixture.componentRef.setInput('resourceId', testSuiteTabResourceId('flow', FLOW_ID));
    fixture.componentRef.setInput('active', true);
    fixture.detectChanges();
  });

  it('shows REQUEST URL field when a request step is selected', () => {
    fixture.componentInstance['handleSelectedStepChange'](REQUEST_STEP.id);
    fixture.detectChanges();

    const urlInput = fixture.nativeElement.querySelector('#ts-req-url');
    expect(urlInput).toBeTruthy();
  });

  it('adds a step at the flow root', async () => {
    fixture.componentInstance['handleAddStepType']('WAIT');
    const testSuite = TestBed.inject(TestSuiteService);
    expect(testSuite.addFlowStep).toHaveBeenCalledWith(FLOW_ID, 'WAIT', null);
  });

  it('opens add step dialog', () => {
    fixture.componentInstance['handleAddStepRequest']();
    expect(fixture.componentInstance['addStepModalOpen']()).toBe(true);
  });

  it('renders flow toolbar, section nav, and steps workspace', () => {
    expect(fixture.nativeElement.querySelector('.ts-flow-tab__toolbar')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.ts-flow-tab__nav')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('tx-horizontal-split-pane')).toBeTruthy();
  });

  it('selects step from run panel', () => {
    fixture.componentInstance['handleRunPanelStepSelect'](REQUEST_STEP.id);
    expect(fixture.componentInstance['selectedStepId']()).toBe(REQUEST_STEP.id);
  });
});
