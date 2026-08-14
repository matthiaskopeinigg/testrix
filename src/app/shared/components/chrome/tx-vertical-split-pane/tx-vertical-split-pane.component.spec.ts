import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';

import { TxIconService } from '@app/shared/icons/tx-icon.service';

import { TxVerticalSplitPaneComponent } from './tx-vertical-split-pane.component';

describe('TxVerticalSplitPaneComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxVerticalSplitPaneComponent],
      providers: [
        {
          provide: TxIconService,
          useValue: { loadIconInner: () => Promise.resolve('<path d="M0 0"/>') },
        },
      ],
    }).compileComponents();
  });

  it('shows the reveal pill when the secondary panel is hidden', () => {
    document.documentElement.setAttribute('data-animation-speed', 'none');

    const fixture = TestBed.createComponent(TxVerticalSplitPaneComponent);
    fixture.componentRef.setInput('secondaryVisible', true);
    fixture.componentRef.setInput('secondaryHidden', true);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.tx-vertical-split-pane__reveal')).not.toBeNull();
    expect(host.querySelector('.tx-vertical-split-pane__panel-region')).toBeNull();
  });

  it('shows the expanded panel when the secondary panel is open', () => {
    document.documentElement.setAttribute('data-animation-speed', 'none');

    const fixture = TestBed.createComponent(TxVerticalSplitPaneComponent);
    fixture.componentRef.setInput('secondaryVisible', true);
    fixture.componentRef.setInput('secondaryHidden', false);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.tx-vertical-split-pane__reveal')).toBeNull();
    expect(host.querySelector('.tx-vertical-split-pane__panel-region')).not.toBeNull();
    expect(host.querySelector('.tx-vertical-split-pane__secondary-content--visible')).not.toBeNull();
  });

  it('emits secondaryHiddenChange when hide is clicked', () => {
    document.documentElement.setAttribute('data-animation-speed', 'none');

    const fixture = TestBed.createComponent(TxVerticalSplitPaneComponent);
    fixture.componentRef.setInput('secondaryVisible', true);
    fixture.componentRef.setInput('secondaryHidden', false);
    fixture.detectChanges();

    const emitted: boolean[] = [];
    fixture.componentInstance.secondaryHiddenChange.subscribe((value) => emitted.push(value));

    const hideButton = fixture.nativeElement.querySelector(
      '.tx-vertical-split-pane__hide-pill',
    ) as HTMLButtonElement;
    hideButton.click();
    fixture.detectChanges();

    expect(emitted).toEqual([true]);
  });

  it('allows dragging the secondary panel taller than the old 600px cap', () => {
    document.documentElement.setAttribute('data-animation-speed', 'none');

    const fixture = TestBed.createComponent(TxVerticalSplitPaneComponent);
    fixture.componentRef.setInput('secondaryVisible', true);
    fixture.componentRef.setInput('secondaryHidden', false);
    fixture.componentRef.setInput('secondaryHeight', 320);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    Object.defineProperty(host, 'getBoundingClientRect', {
      configurable: true,
      value: () =>
        ({
          top: 0,
          left: 0,
          right: 900,
          bottom: 1000,
          width: 900,
          height: 1000,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) satisfies DOMRect,
    });

    const heights: number[] = [];
    fixture.componentInstance.secondaryHeightChange.subscribe((value) => heights.push(value));

    const handle = host.querySelector('.tx-vertical-split-pane__handle') as HTMLElement;
    handle.dispatchEvent(
      new MouseEvent('mousedown', { clientY: 700, bubbles: true, cancelable: true }),
    );
    window.dispatchEvent(
      new MouseEvent('mousemove', { clientY: 200, bubbles: true, cancelable: true }),
    );
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));

    expect(heights.at(-1)).toBeGreaterThan(600);
    expect(heights.at(-1)).toBe(820);
  });

  it('allows collapsing the primary panel so the secondary can fill the host', () => {
    document.documentElement.setAttribute('data-animation-speed', 'none');

    const fixture = TestBed.createComponent(TxVerticalSplitPaneComponent);
    fixture.componentRef.setInput('secondaryVisible', true);
    fixture.componentRef.setInput('secondaryHidden', false);
    fixture.componentRef.setInput('secondaryHeight', 320);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    Object.defineProperty(host, 'getBoundingClientRect', {
      configurable: true,
      value: () =>
        ({
          top: 0,
          left: 0,
          right: 900,
          bottom: 900,
          width: 900,
          height: 900,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) satisfies DOMRect,
    });

    const heights: number[] = [];
    fixture.componentInstance.secondaryHeightChange.subscribe((value) => heights.push(value));

    const handle = host.querySelector('.tx-vertical-split-pane__handle') as HTMLElement;
    handle.dispatchEvent(
      new MouseEvent('mousedown', { clientY: 580, bubbles: true, cancelable: true }),
    );
    window.dispatchEvent(
      new MouseEvent('mousemove', { clientY: 0, bubbles: true, cancelable: true }),
    );
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));

    // host 900 - handle 20 - min primary 0
    expect(heights.at(-1)).toBe(880);
  });
});
