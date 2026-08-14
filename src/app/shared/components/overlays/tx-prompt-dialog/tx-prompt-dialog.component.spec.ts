import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { TxPromptDialogComponent } from './tx-prompt-dialog.component';

describe('TxPromptDialogComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxPromptDialogComponent],
    }).compileComponents();
  });

  it('emits submitted with trimmed value', () => {
    const fixture = TestBed.createComponent(TxPromptDialogComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('defaultValue', 'Example');
    fixture.detectChanges();

    fixture.componentInstance['value'].set('  My example  ');
    const submitted = vi.fn();
    fixture.componentInstance.submitted.subscribe(submitted);

    fixture.componentInstance['handleSubmit']();
    expect(submitted).toHaveBeenCalledWith('My example');
  });

  it('does not submit when value is blank', () => {
    const fixture = TestBed.createComponent(TxPromptDialogComponent);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    fixture.componentInstance['value'].set('   ');
    const submitted = vi.fn();
    fixture.componentInstance.submitted.subscribe(submitted);

    fixture.componentInstance['handleSubmit']();
    expect(submitted).not.toHaveBeenCalled();
  });
});
