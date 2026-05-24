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
});
