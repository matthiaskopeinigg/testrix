import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TxHorizontalSplitPaneComponent } from './tx-horizontal-split-pane.component';

describe('TxHorizontalSplitPaneComponent', () => {
  let fixture: ComponentFixture<TxHorizontalSplitPaneComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxHorizontalSplitPaneComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TxHorizontalSplitPaneComponent);
    fixture.componentRef.setInput('secondaryWidth', 288);
    fixture.detectChanges();
  });

  it('renders primary and secondary slots when secondary is visible', () => {
    expect(fixture.nativeElement.querySelector('.tx-horizontal-split-pane__primary')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.tx-horizontal-split-pane__secondary')).toBeTruthy();
  });

  it('commits width on drag end', () => {
    const commit = vi.fn();
    fixture.componentInstance.secondaryWidthCommit.subscribe(commit);

    fixture.componentInstance['handlePointerDown']({
      preventDefault: () => {},
      clientX: 100,
    } as MouseEvent);

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 150 }));
    window.dispatchEvent(new MouseEvent('mouseup'));

    expect(commit).toHaveBeenCalledWith(338);
  });
});
