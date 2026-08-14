import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TxTooltipDirective } from './tx-tooltip.directive';
import { TxTooltipService } from './tx-tooltip.service';

@Component({
  standalone: true,
  imports: [TxTooltipDirective],
  template: `<button type="button" txTooltip="Development" txTooltipPosition="right">Icon</button>`,
})
class HostComponent {}

@Component({
  standalone: true,
  imports: [TxTooltipDirective],
  template: `<button type="button" [txTooltip]="label" txTooltipPosition="top">Icon</button>`,
})
class MultilineHostComponent {
  readonly label = 'Line one\nLine two';
}

describe('TxTooltipDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let service: TxTooltipService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    service = TestBed.inject(TxTooltipService);
    fixture.detectChanges();
  });

  afterEach(() => {
    service.hideImmediate();
    document.querySelectorAll('.tx-tooltip').forEach((el) => el.remove());
  });

  it('shows styled tooltip on hover after delay', async () => {
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button')!;
    expect(button.getAttribute('title')).toBeNull();

    button.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 360));

    const tip = document.querySelector('.tx-tooltip');
    expect(tip?.textContent).toBe('Development');
    expect(tip?.classList.contains('is-visible')).toBe(true);
  });

});

describe('TxTooltipDirective (multiline)', () => {
  let fixture: ComponentFixture<MultilineHostComponent>;
  let service: TxTooltipService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MultilineHostComponent],
    }).compileComponents();

    service = TestBed.inject(TxTooltipService);
    fixture = TestBed.createComponent(MultilineHostComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    service.hideImmediate();
    document.querySelectorAll('.tx-tooltip').forEach((el) => el.remove());
  });

  it('marks tooltip as multiline when copy contains newlines', async () => {
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button')!;

    button.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 360));

    const tip = document.querySelector('.tx-tooltip') as HTMLElement | null;
    expect(tip?.dataset['multiline']).toBe('true');
    expect(tip?.textContent).toBe('Line one\nLine two');
  });
});
