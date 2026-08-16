import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TxIconService } from '@app/shared/icons/tx-icon.service';

import { DatabaseQueryParamsDialogComponent } from './database-query-params-dialog.component';

describe('DatabaseQueryParamsDialogComponent', () => {
  let fixture: ComponentFixture<DatabaseQueryParamsDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DatabaseQueryParamsDialogComponent],
      providers: [
        {
          provide: TxIconService,
          useValue: {
            loadIconInner: () => Promise.resolve('<circle cx="12" cy="12" r="3"/>'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DatabaseQueryParamsDialogComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('names', ['email']);
    fixture.detectChanges();
  });

  it('creates the parameter dialog', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });
});
