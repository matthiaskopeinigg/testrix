import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TxIconService } from '../../icons/tx-icon.service';

import { TxTagsInputComponent } from './tx-tags-input.component';

describe('TxTagsInputComponent', () => {
  let fixture: ComponentFixture<TxTagsInputComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxTagsInputComponent],
      providers: [
        {
          provide: TxIconService,
          useValue: { loadIconInner: () => Promise.resolve('<svg></svg>') },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TxTagsInputComponent);
    fixture.detectChanges();
  });

  it('opens the add-tag panel when the tag button is clicked', () => {
    const trigger = fixture.nativeElement.querySelector('.tx-tags-input__trigger') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.tx-tags-input__panel')).toBeTruthy();
  });

  it('opens the add-tag panel and adds a tag in compact mode', () => {
    fixture.componentRef.setInput('compact', true);
    fixture.detectChanges();

    const emitted: string[][] = [];
    fixture.componentInstance.tagsChange.subscribe((tags) => emitted.push([...tags]));

    const trigger = fixture.nativeElement.querySelector('.tx-tags-input__add-btn') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.tx-tags-input__panel-tags')).toBeTruthy();

    const input = fixture.nativeElement.querySelector('.tx-tags-input__control') as HTMLInputElement;
    input.value = 'smoke';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();

    expect(emitted.at(-1)).toEqual(['smoke']);
    expect(fixture.nativeElement.textContent).toContain('smoke');
    expect(fixture.nativeElement.querySelector('.tx-tags-input__compact-chips')?.textContent).toContain('smoke');
  });
});
