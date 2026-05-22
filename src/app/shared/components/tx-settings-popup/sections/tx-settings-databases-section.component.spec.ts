import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it } from 'vitest';

import { createDefaultSettings } from '@shared/config';

import { ConfigService } from '@app/core/config/config.service';
import { ElectronService } from '@app/core/electron/electron.service';
import { TxIconService } from '@app/shared/icons/tx-icon.service';

import { TxSettingsDatabasesSectionComponent } from './tx-settings-databases-section.component';

describe('TxSettingsDatabasesSectionComponent', () => {
  it('emits updated connections when a connection is added', () => {
    TestBed.configureTestingModule({
      imports: [TxSettingsDatabasesSectionComponent],
      providers: [
        { provide: ElectronService, useValue: { bridge: () => null } },
        { provide: ConfigService, useValue: { settings: () => createDefaultSettings() } },
        {
          provide: TxIconService,
          useValue: { getSvg: () => '', register: () => undefined },
        },
      ],
    });

    const fixture = TestBed.createComponent(TxSettingsDatabasesSectionComponent);
    const emitted: unknown[] = [];
    fixture.componentRef.setInput('connections', []);
    fixture.componentInstance.connectionsChange.subscribe((value) => emitted.push(value));
    fixture.detectChanges();

    const addButton = fixture.debugElement.query(By.css('.tx-settings-databases__head tx-button'));
    addButton.triggerEventHandler('pressed', new MouseEvent('click'));
    expect(emitted.length).toBe(1);
    expect((emitted[0] as { length: number }).length).toBe(1);
  });
});
