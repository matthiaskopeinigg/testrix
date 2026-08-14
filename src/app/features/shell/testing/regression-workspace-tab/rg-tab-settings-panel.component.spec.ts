import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { createDefaultRegressionProfile, createDefaultRegressionThresholds } from '../../../../../../shared/testing';

import { TxIconService } from '@app/shared/icons/tx-icon.service';

import { RgTabSettingsPanelComponent } from './rg-tab-settings-panel.component';

describe('RgTabSettingsPanelComponent', () => {
  let fixture: ComponentFixture<RgTabSettingsPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RgTabSettingsPanelComponent],
      providers: [
        {
          provide: TxIconService,
          useValue: { loadIconInner: () => Promise.resolve('') },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RgTabSettingsPanelComponent);
    fixture.componentRef.setInput('name', 'Smoke');
    fixture.componentRef.setInput('release', 'v1.0.0');
    fixture.componentRef.setInput('tags', ['nightly']);
    fixture.componentRef.setInput('description', 'Daily smoke');
    fixture.componentRef.setInput('profile', createDefaultRegressionProfile());
    fixture.componentRef.setInput('thresholds', createDefaultRegressionThresholds());
    fixture.componentRef.setInput('environmentOptions', [{ value: '', label: 'No environment' }]);
    fixture.detectChanges();
  });

  it('emits releaseChange when release is updated', () => {
    const emit = vi.fn();
    fixture.componentInstance.releaseChange.subscribe(emit);

    fixture.componentInstance.releaseChange.emit('v2.0.0');

    expect(emit).toHaveBeenCalledWith('v2.0.0');
  });

  it('emits profileChange when allFlowsAtOnce is toggled', () => {
    const emit = vi.fn();
    fixture.componentInstance.profileChange.subscribe(emit);

    fixture.componentInstance.profileChange.emit({
      ...createDefaultRegressionProfile(),
      allFlowsAtOnce: true,
    });

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ allFlowsAtOnce: true }),
    );
  });
});
