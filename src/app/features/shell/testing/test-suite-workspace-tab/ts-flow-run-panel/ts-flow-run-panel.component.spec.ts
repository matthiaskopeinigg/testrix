import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigService } from '@app/core/config/config.service';
import { createDefaultSettings } from '@shared/config';
import { createFlowStep } from '@shared/testing';
import { TxIconService } from '@app/shared/icons/tx-icon.service';

import { TsFlowRunPanelComponent } from './ts-flow-run-panel.component';

describe('TsFlowRunPanelComponent', () => {
  let fixture: ComponentFixture<TsFlowRunPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TsFlowRunPanelComponent],
      providers: [
        {
          provide: ConfigService,
          useValue: { settings: signal(createDefaultSettings()) },
        },
        {
          provide: TxIconService,
          useValue: {
            loadIconInner: () => Promise.resolve('<path d="M6 6l12 12"/>'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TsFlowRunPanelComponent);
    fixture.componentRef.setInput('flow', {
      id: 'flow-1',
      name: 'Demo flow',
      nodes: [],
      lastRunAt: null,
      lastRunStatus: 'never' as const,
    });
    fixture.detectChanges();
  });

  it('shows idle empty when no runs', () => {
    expect(fixture.nativeElement.querySelector('.ts-flow-run-panel__empty-title')?.textContent).toContain(
      'No runs yet',
    );
  });

  it('shows failure banner when message is set', () => {
    fixture.componentRef.setInput('lastRunMessage', 'Step failed');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Step failed');
  });

  it('renders timeline rows from live statuses', () => {
    const step = createFlowStep('WAIT', 'Wait');
    fixture.componentRef.setInput('flow', {
      id: 'flow-1',
      name: 'Demo flow',
      nodes: [step],
      lastRunAt: '2026-01-01T00:00:00.000Z',
      lastRunStatus: 'passed' as const,
    });
    fixture.componentRef.setInput('liveStepStatuses', { [step.id]: 'passed' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.ts-flow-run-panel__row').length).toBe(1);
  });

  it('emits stepSelect when a timeline row is clicked', () => {
    const step = createFlowStep('WAIT', 'Wait');
    step.id = 'step-wait';
    fixture.componentRef.setInput('flow', {
      id: 'flow-1',
      name: 'Demo flow',
      nodes: [step],
      lastRunAt: '2026-01-01T00:00:00.000Z',
      lastRunStatus: 'passed' as const,
    });
    fixture.componentRef.setInput('liveStepStatuses', { [step.id]: 'passed' });
    fixture.detectChanges();

    const handler = vi.fn();
    fixture.componentInstance.stepSelect.subscribe(handler);
    fixture.nativeElement.querySelector('.ts-flow-run-panel__row')?.click();
    expect(handler).toHaveBeenCalledWith('step-wait');
  });

  it('shows progress bar while running', () => {
    const step = createFlowStep('WAIT', 'Wait');
    step.id = 'step-wait';
    fixture.componentRef.setInput('flow', {
      id: 'flow-1',
      name: 'Demo flow',
      nodes: [step],
      lastRunAt: null,
      lastRunStatus: 'never' as const,
    });
    fixture.componentRef.setInput('running', true);
    fixture.componentRef.setInput('liveStepStatuses', { [step.id]: 'running' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.ts-flow-run-panel__progress')).toBeTruthy();
  });

  it('shows validation diff table for selected validation step', () => {
    const requestStep = createFlowStep('REQUEST', 'Get users');
    requestStep.id = 'step-req';
    requestStep.lastRunCapture = {
      kind: 'http_response',
      capturedAt: '2026-01-01T00:00:00.000Z',
      statusCode: 404,
      statusText: 'Not Found',
      bodyText: '',
      headers: {},
    };

    const validationStep = createFlowStep('VALIDATION', 'Check status');
    validationStep.id = 'step-val';
    validationStep.config = {
      refStepId: 'step-req',
      rules: [{ source: 'response_status', expression: '', operator: 'equals', expected: '200' }],
    };
    validationStep.lastRunStatus = 'failed';
    validationStep.error = 'Validation failed (response_status equals "200"): got "404"';

    fixture.componentRef.setInput('flow', {
      id: 'flow-1',
      name: 'Demo flow',
      nodes: [requestStep, validationStep],
      lastRunAt: '2026-01-01T00:00:00.000Z',
      lastRunStatus: 'failed' as const,
    });
    fixture.componentRef.setInput('selectedStepId', 'step-val');
    fixture.componentRef.setInput('liveStepErrors', {
      'step-val': 'Validation failed (response_status equals "200"): got "404"',
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.ts-flow-run-panel__diff-table')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('404');
    expect(fixture.nativeElement.textContent).toContain('200');
    expect(fixture.nativeElement.textContent).toContain('Validation failed');
  });

  it('shows failed step error inline in the timeline row', () => {
    const step = createFlowStep('REQUEST', 'Get users');
    step.id = 'step-req';
    step.lastRunStatus = 'failed';
    step.error = 'HTTP 404 Not Found';

    fixture.componentRef.setInput('flow', {
      id: 'flow-1',
      name: 'Demo flow',
      nodes: [step],
      lastRunAt: '2026-01-01T00:00:00.000Z',
      lastRunStatus: 'failed' as const,
    });
    fixture.componentRef.setInput('liveStepStatuses', { [step.id]: 'failed' });
    fixture.componentRef.setInput('liveStepErrors', { [step.id]: 'HTTP 404 Not Found' });
    fixture.detectChanges();

    const subtitle = fixture.nativeElement.querySelector('.ts-flow-run-panel__row-sub.is-error');
    expect(subtitle?.textContent).toContain('HTTP 404 Not Found');
  });
});
