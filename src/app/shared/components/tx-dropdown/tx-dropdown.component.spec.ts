import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TxIconService } from '../../icons/tx-icon.service';

import { TxDropdownComponent } from './tx-dropdown.component';
import type { TxDropdownOption } from './tx-dropdown.types';

@Component({
  standalone: true,
  imports: [TxDropdownComponent],
  template: `
    <div class="stop-propagation-host" (click)="$event.stopPropagation()">
      <tx-dropdown [options]="options" />
      <button type="button" class="outside-target">Outside</button>
    </div>
  `,
})
class DropdownInsideStopPropagationHostComponent {
  readonly options: readonly TxDropdownOption[] = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
  ];
}

describe('TxDropdownComponent', () => {
  let fixture: ComponentFixture<TxDropdownComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxDropdownComponent],
      providers: [
        {
          provide: TxIconService,
          useValue: {
            loadIconInner: () => Promise.resolve('<circle cx="12" cy="12" r="3"/>'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TxDropdownComponent);
    fixture.componentRef.setInput('options', [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta' },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('renders a combobox trigger', () => {
    const trigger = fixture.nativeElement.querySelector('.tx-dropdown__trigger') as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens the listbox and selects an option', async () => {
    const host = fixture.nativeElement as HTMLElement;
    const trigger = host.querySelector('.tx-dropdown__trigger') as HTMLButtonElement;

    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const options = host.querySelectorAll('button.tx-dropdown__option');
    expect(options.length).toBe(2);

    (options[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(trigger.textContent).toContain('Beta');
    expect(host.querySelector('.tx-dropdown__panel')).toBeNull();
  });

  it('supports ControlValueAccessor writeValue', () => {
    fixture.componentInstance.writeValue('a');
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector('.tx-dropdown__trigger') as HTMLButtonElement;
    expect(trigger.textContent).toContain('Alpha');
  });

  it('closes when clicking outside the host', async () => {
    const host = fixture.nativeElement as HTMLElement;
    const trigger = host.querySelector('.tx-dropdown__trigger') as HTMLButtonElement;

    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.querySelector('.tx-dropdown__panel')).toBeTruthy();

    document.body.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('.tx-dropdown__panel')).toBeNull();
  });

  it('closes on outside click when an ancestor stops propagation', async () => {
    const wrapperFixture = TestBed.createComponent(DropdownInsideStopPropagationHostComponent);
    wrapperFixture.detectChanges();
    await wrapperFixture.whenStable();
    wrapperFixture.detectChanges();

    const host = wrapperFixture.nativeElement as HTMLElement;
    const trigger = host.querySelector('.tx-dropdown__trigger') as HTMLButtonElement;
    const outside = host.querySelector('.outside-target') as HTMLButtonElement;

    trigger.click();
    wrapperFixture.detectChanges();
    await wrapperFixture.whenStable();
    wrapperFixture.detectChanges();
    expect(host.querySelector('.tx-dropdown__panel')).toBeTruthy();

    outside.click();
    wrapperFixture.detectChanges();
    await wrapperFixture.whenStable();
    wrapperFixture.detectChanges();

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('.tx-dropdown__panel')).toBeNull();
  });

});
