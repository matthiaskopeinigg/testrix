import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TxIconService } from '../../../icons/tx-icon.service';
import { TxFormFieldComponent } from '../tx-form-field/tx-form-field.component';

import { TxTreeSelectComponent } from './tx-tree-select.component';

@Component({
  standalone: true,
  imports: [TxFormFieldComponent, TxTreeSelectComponent],
  template: `
    <tx-form-field label="Connection" controlId="conn-pick">
      <tx-tree-select id="conn-pick" [nodes]="nodes" />
    </tx-form-field>
  `,
})
class TreeSelectFormFieldHostComponent {
  readonly nodes = [
    {
      id: 'folder',
      label: 'Prod',
      kind: 'folder' as const,
      children: [{ id: 'conn-1', label: 'Primary', kind: 'connection' as const }],
    },
  ];
}

/** The panel is portaled to `document.body`, so queries must not stay on the host. */
function queryOpenPanel(): HTMLElement | null {
  return document.body.querySelector('.tx-tree-select__panel');
}

describe('TxTreeSelectComponent', () => {
  let fixture: ComponentFixture<TxTreeSelectComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxTreeSelectComponent],
      providers: [
        {
          provide: TxIconService,
          useValue: {
            loadIconInner: () => Promise.resolve('<circle cx="12" cy="12" r="3"/>'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TxTreeSelectComponent);
    fixture.componentRef.setInput('nodes', [
      {
        id: 'folder',
        label: 'Prod',
        kind: 'folder',
        children: [{ id: 'conn-1', label: 'Primary', kind: 'connection' }],
      },
    ]);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    queryOpenPanel()?.remove();
  });

  it('opens the tree and selects a leaf', async () => {
    const host = fixture.nativeElement as HTMLElement;
    const trigger = host.querySelector('.tx-tree-select__trigger') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const panel = queryOpenPanel();
    expect(panel?.parentElement).toBe(document.body);
    const labels = [...(panel?.querySelectorAll('.tx-tree-row__label') ?? [])].map((el) =>
      el.textContent?.trim(),
    );
    expect(labels).toContain('Prod');
  });

  it('does not show an expand control on connection leaves', async () => {
    const host = fixture.nativeElement as HTMLElement;
    const trigger = host.querySelector('.tx-tree-select__trigger') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const panel = queryOpenPanel();
    const connectionRow = [...(panel?.querySelectorAll('.tx-tree-row') ?? [])].find((row) =>
      row.textContent?.includes('Primary'),
    ) as HTMLElement | undefined;
    expect(connectionRow).toBeUndefined();

    const folderRow = [...(panel?.querySelectorAll('.tx-tree-row') ?? [])].find((row) =>
      row.textContent?.includes('Prod'),
    ) as HTMLElement;
    folderRow.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const leafRow = [...(queryOpenPanel()?.querySelectorAll('.tx-tree-row') ?? [])].find((row) =>
      row.textContent?.includes('Primary'),
    ) as HTMLElement;
    const chevron = leafRow.querySelector('.tx-tree-row__chevron');
    expect(chevron?.classList.contains('tx-tree-row__chevron--hidden')).toBe(true);
    expect(leafRow.querySelector('.tx-tree-row__chevron-icon')).toBeNull();
  });

  it('expands a folder on row click without selecting it', async () => {
    const host = fixture.nativeElement as HTMLElement;
    const trigger = host.querySelector('.tx-tree-select__trigger') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const panel = queryOpenPanel();
    const folderRow = [...(panel?.querySelectorAll('.tx-tree-row') ?? [])].find((row) =>
      row.textContent?.includes('Prod'),
    ) as HTMLElement | undefined;
    expect(folderRow).toBeTruthy();
    folderRow!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const labels = [...(queryOpenPanel()?.querySelectorAll('.tx-tree-row__label') ?? [])].map((el) =>
      el.textContent?.trim(),
    );
    expect(labels).toContain('Primary');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    folderRow!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const collapsed = [...(queryOpenPanel()?.querySelectorAll('.tx-tree-row__label') ?? [])].map(
      (el) => el.textContent?.trim(),
    );
    expect(collapsed).not.toContain('Primary');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('TxTreeSelectComponent inside tx-form-field', () => {
  it('keeps the panel open when a folder row is clicked', async () => {
    await TestBed.configureTestingModule({
      imports: [TreeSelectFormFieldHostComponent],
      providers: [
        {
          provide: TxIconService,
          useValue: {
            loadIconInner: () => Promise.resolve('<circle cx="12" cy="12" r="3"/>'),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(TreeSelectFormFieldHostComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('label.tx-field__label')).toBeNull();

    const trigger = host.querySelector('.tx-tree-select__trigger') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const folderRow = [...(queryOpenPanel()?.querySelectorAll('.tx-tree-row') ?? [])].find((row) =>
      row.textContent?.includes('Prod'),
    ) as HTMLElement;
    folderRow.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const labels = [...(queryOpenPanel()?.querySelectorAll('.tx-tree-row__label') ?? [])].map((el) =>
      el.textContent?.trim(),
    );
    expect(labels).toContain('Primary');
    fixture.destroy();
    queryOpenPanel()?.remove();
  });
});
