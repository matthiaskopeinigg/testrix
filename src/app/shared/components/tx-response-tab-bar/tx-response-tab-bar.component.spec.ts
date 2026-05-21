import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { TxResponseTabBarComponent } from './tx-response-tab-bar.component';

describe('TxResponseTabBarComponent', () => {
  it('emits activeTabChange when a tab is clicked', () => {
    const fixture: ComponentFixture<TxResponseTabBarComponent> = TestBed.createComponent(
      TxResponseTabBarComponent,
    );
    fixture.componentRef.setInput('tabs', [
      { id: 'body', label: 'Pretty' },
      { id: 'headers', label: 'Headers' },
    ]);
    fixture.componentRef.setInput('activeTab', 'body');
    fixture.detectChanges();

    let next: string | undefined;
    fixture.componentInstance.activeTabChange.subscribe((id) => {
      next = id;
    });

    const buttons = fixture.nativeElement.querySelectorAll('.tx-response-tab-bar__tab');
    (buttons[1] as HTMLButtonElement).click();
    expect(next).toBe('headers');
  });
});
