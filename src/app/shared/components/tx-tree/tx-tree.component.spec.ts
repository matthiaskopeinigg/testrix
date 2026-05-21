import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TxIconService } from '@app/shared/icons/tx-icon.service';

import { TxTreeComponent } from './tx-tree.component';
import { TX_TREE_DEMO_NODES } from './tx-tree.sample';

describe('TxTreeComponent', () => {
  let fixture: ComponentFixture<TxTreeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxTreeComponent],
      providers: [
        {
          provide: TxIconService,
          useValue: {
            loadIconInner: () => Promise.resolve('<path d="M6 6l12 12"/>'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TxTreeComponent);
    fixture.componentRef.setInput('nodes', TX_TREE_DEMO_NODES);
    fixture.detectChanges();
  });

  it('renders tree rows for top-level nodes', () => {
    const rows = fixture.nativeElement.querySelectorAll('tx-tree-row');
    expect(rows.length).toBeGreaterThan(0);
  });

  it('expands a folder when the chevron is clicked', () => {
    const chevron = fixture.nativeElement.querySelector(
      '.tx-tree-row__chevron',
    ) as HTMLButtonElement | null;
    expect(chevron).toBeTruthy();
    chevron?.click();
    fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll('tx-tree-row');
    expect(rows.length).toBeGreaterThan(2);
  });
});
