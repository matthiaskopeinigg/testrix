import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { ConfigService } from '@app/core/config/config.service';
import { createDefaultSettings } from '@shared/config';
import { createFlowStep } from '@shared/testing';
import { TxIconService } from '@app/shared/icons/tx-icon.service';

import { TsFlowStepTreeComponent } from './ts-flow-step-tree.component';

describe('TsFlowStepTreeComponent', () => {
  let fixture: ComponentFixture<TsFlowStepTreeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TsFlowStepTreeComponent],
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

    fixture = TestBed.createComponent(TsFlowStepTreeComponent);
    fixture.componentRef.setInput('nodes', [createFlowStep('REQUEST', 'Get health')]);
    fixture.detectChanges();
  });

  it('uses a flat step tree config', () => {
    const config = fixture.componentInstance['treeConfig']();
    expect(config.sort?.siblingSort).toBe('manual');
    expect(config.drop?.canDrop).toBeTypeOf('function');
  });

  it('emits selected step id on step click', () => {
    const handler = vi.fn();
    fixture.componentInstance.selectedStepIdChange.subscribe(handler);
    fixture.componentInstance['handleNodeClick']({ nodeId: 'step-a' });
    expect(handler).toHaveBeenCalledWith('step-a');
  });

  it('exposes run order index for enabled steps', () => {
    const step = createFlowStep('REQUEST', 'Get health');
    step.id = 'step-a';
    fixture.componentRef.setInput('nodes', [step]);
    fixture.detectChanges();
    expect(fixture.componentInstance['rowIndex']({
      node: {
        id: 'step-a',
        label: 'Get health',
        kind: 'step',
        data: { kind: 'step', stepType: 'REQUEST' },
      },
    })).toBe(1);
  });
});
