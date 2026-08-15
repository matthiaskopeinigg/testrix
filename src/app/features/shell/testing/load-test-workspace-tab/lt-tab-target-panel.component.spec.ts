import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { createDefaultSettings } from '@shared/config';
import { CollectionsService } from '@app/core/collections/collections.service';
import { ConfigService } from '@app/core/config/config.service';
import { EnvironmentsService } from '@app/core/environments/environments.service';
import { ElectronService } from '@app/core/electron/electron.service';
import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';
import { TxIconService } from '@app/shared/icons/tx-icon.service';

import { LtTabTargetPanelComponent } from './lt-tab-target-panel.component';

describe('LtTabTargetPanelComponent', () => {
  let fixture: ComponentFixture<LtTabTargetPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LtTabTargetPanelComponent],
      providers: [
        {
          provide: CollectionsService,
          useValue: {
            nodes: signal([]),
          },
        },
        {
          provide: EnvironmentsService,
          useValue: {
            environments: signal([]),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            settings: signal(createDefaultSettings()),
          },
        },
        {
          provide: ElectronService,
          useValue: { bridge: () => null },
        },
        {
          provide: UiPreferencesService,
          useValue: {
            showIconTooltips: () => true,
            entranceStaggerEnabled: () => false,
            animationsEnabled: () => false,
            animationSpeed: () => 'normal',
          },
        },
        {
          provide: TxIconService,
          useValue: {
            loadIconInner: () => Promise.resolve('<path d="M6 6l12 12"/>'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LtTabTargetPanelComponent);
    fixture.detectChanges();
  });

  it('defaults to the collection request picker', () => {
    expect(fixture.componentInstance.targetSource()).toBe('collection');
    expect(fixture.componentInstance['targetSourceOptions'][0]?.label).toBe('Existing request');
    expect(fixture.nativeElement.textContent).toContain('Pick an existing collection request');
  });

  it('shows the manual URL editor when the source is manual', () => {
    fixture.componentRef.setInput('targetSource', 'manual');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Specify a URL for this load test target');
    expect(fixture.nativeElement.textContent).toContain('Build the HTTP request this load test will send');
  });

  it('hosts the body editor in a fill pane', () => {
    fixture.componentRef.setInput('targetSource', 'manual');
    fixture.componentInstance['handleSectionSelect']('body');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.lt-target-panel__body-editor')).toBeTruthy();
  });

  it('emits a source change without clearing a collection request id', () => {
    const sourceHandler = vi.fn();
    fixture.componentInstance.targetSourceChange.subscribe(sourceHandler);
    fixture.componentInstance['handleTargetSourceChange']('manual');
    expect(sourceHandler).toHaveBeenCalledWith('manual');
  });

  it('shows an environment picker that inherits from the collection request', () => {
    expect(fixture.nativeElement.textContent).toContain('Environment');
    expect(fixture.componentInstance['environmentPlaceholder']()).toBe('Inherit from request');
  });
});
