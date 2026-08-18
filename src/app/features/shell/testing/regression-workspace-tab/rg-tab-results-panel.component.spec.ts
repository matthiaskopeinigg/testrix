import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigService } from '@app/core/config/config.service';
import { TestSuiteService } from '@app/core/testing/test-suite.service';
import { createDefaultSettings } from '@shared/config';
import {
  createDefaultRegressionProfile,
  createFlowStep,
  type RegressionRun,
  type TestSuiteFlow,
} from '@shared/testing';
import { TxIconService } from '@app/shared/icons/tx-icon.service';

import { RgTabResultsPanelComponent } from './rg-tab-results-panel.component';

function failedRun(): RegressionRun {
  const step = createFlowStep('REQUEST', 'Get users');
  step.id = 'step-1';
  return {
    id: 'run-1',
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:01:00.000Z',
    status: 'failed',
    passedCount: 0,
    failedCount: 1,
    skippedCount: 0,
    flakedCount: 0,
    profileSnapshot: createDefaultRegressionProfile(),
    thresholdsSnapshot: { acceptancePercent: 100 },
    flowResults: [
      {
        flowId: 'flow-1',
        flowName: 'Login',
        status: 'failed',
        durationMs: 420,
        message: 'Get users: HTTP 500',
        attemptCount: 1,
        passedStepCount: 0,
        failedStepCount: 1,
        skippedStepCount: 0,
        validationFailures: [],
        stepStatuses: { 'step-1': 'failed' },
        stepDurations: { 'step-1': 420 },
        stepErrors: { 'step-1': 'HTTP 500' },
        stepCaptures: {
          'step-1': {
            kind: 'http_response',
            capturedAt: '2026-01-01T00:00:00.000Z',
            statusCode: 500,
            statusText: 'Error',
            bodyText: '',
            headers: {},
          },
        },
      },
    ],
    flowTimeline: [],
    samples: [],
    thresholdResults: [],
  };
}

function sourceFlow(): TestSuiteFlow {
  const step = createFlowStep('REQUEST', 'Get users');
  step.id = 'step-1';
  return {
    id: 'flow-1',
    name: 'Login',
    description: '',
    tags: [],
    lastRunStatus: 'never',
    lastRunAt: null,
    nodes: [step],
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('RgTabResultsPanelComponent', () => {
  let fixture: ComponentFixture<RgTabResultsPanelComponent>;
  const findFlow = vi.fn((id: string) => (id === 'flow-1' ? sourceFlow() : null));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RgTabResultsPanelComponent],
      providers: [
        {
          provide: ConfigService,
          useValue: { settings: signal(createDefaultSettings()) },
        },
        {
          provide: TestSuiteService,
          useValue: { findFlow },
        },
        {
          provide: TxIconService,
          useValue: {
            loadIconInner: () => Promise.resolve('<path d="M6 6l12 12"/>'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RgTabResultsPanelComponent);
    fixture.componentRef.setInput('runState', 'completed');
    fixture.componentRef.setInput('runs', [failedRun()]);
    fixture.detectChanges();
  });

  it('shows recovered retries as flaked, not in the failed count', () => {
    const flakedRun: RegressionRun = {
      ...failedRun(),
      status: 'passed',
      passedCount: 1,
      failedCount: 0,
      flakedCount: 1,
      flowResults: [
        {
          flowId: 'flow-1',
          flowName: 'Login',
          status: 'passed',
          durationMs: 420,
          attemptCount: 2,
          flaked: true,
          attempts: [
            { status: 'failed', durationMs: 200, message: 'timeout' },
            { status: 'passed', durationMs: 220 },
          ],
          passedStepCount: 1,
          failedStepCount: 0,
          skippedStepCount: 0,
          validationFailures: [],
        },
      ],
    };
    fixture.componentRef.setInput('runs', [flakedRun]);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('passed on attempt 2');
    expect(text).toMatch(/Failed\s*0/);
    expect(text).toMatch(/Flaked\s*1/);
  });

  it('shows the flow run log after a completed flow row is selected', () => {
    fixture.componentInstance.selectedFlowDiffIdChange.subscribe((id) => {
      fixture.componentRef.setInput('selectedFlowDiffId', id);
    });
    expect(fixture.nativeElement.querySelector('app-ts-flow-run-panel')).toBeNull();

    const row = fixture.nativeElement.querySelector('.rg-results-panel__flow-row') as HTMLTableRowElement;
    expect(row).toBeTruthy();
    row.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-ts-flow-run-panel')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Get users');
    expect(fixture.nativeElement.textContent).toContain('HTTP 500');
  });
});
