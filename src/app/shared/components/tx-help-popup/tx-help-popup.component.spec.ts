import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TxIconService } from '../../icons/tx-icon.service';

import { TxHelpPopupComponent } from './tx-help-popup.component';

describe('TxHelpPopupComponent', () => {
  let fixture: ComponentFixture<TxHelpPopupComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxHelpPopupComponent],
      providers: [
        {
          provide: TxIconService,
          useValue: { loadIconInner: () => Promise.resolve('<path d="M0 0"/>') },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TxHelpPopupComponent);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders grouped sidebar and default section when open', async () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    await flushFrame();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent ?? '';
    expect(text).toContain('Help');
    expect(text).toContain('Guide to Testrix features');
    expect(text).toContain('Overview');
    expect(text).toContain('Getting started');
  });

  it('switches section content when a sidebar item is clicked', async () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    await flushFrame();
    fixture.detectChanges();

    const buttons = Array.from(fixture.nativeElement.querySelectorAll('.tx-help__sidebar-item')) as HTMLButtonElement[];
    const collectionsButton = buttons.find((btn) => btn.textContent?.includes('Collections tree'));
    expect(collectionsButton).toBeTruthy();

    collectionsButton?.click();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent ?? '';
    expect(text).toContain('Collections tree');
  });

  it('emits closed when the close button is clicked', async () => {
    const closed = vi.fn();
    fixture.componentRef.setInput('open', true);
    fixture.componentInstance.closed.subscribe(closed);
    fixture.detectChanges();
    await flushFrame();
    fixture.detectChanges();

    const closeBtn = fixture.nativeElement.querySelector('.tx-overlay-dialog__close') as HTMLButtonElement;
    closeBtn.click();
    fixture.detectChanges();

    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('filters sidebar items when search query is entered', async () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    await flushFrame();
    fixture.detectChanges();

    fixture.componentInstance['handleSearchChange']('mock server');
    fixture.detectChanges();

    const labels = Array.from(
      fixture.nativeElement.querySelectorAll('.tx-help__sidebar-item-label'),
    ).map((node: Element) => node.textContent?.trim() ?? '');
    expect(labels.some((label) => label.toLowerCase().includes('mock'))).toBe(true);
    expect(labels.some((label) => label === 'Getting started')).toBe(false);
  });
});

function flushFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}
