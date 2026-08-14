import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import type { UpdaterStatus } from '@shared/updater/updater-status.schema';

import { UpdateService } from '@app/core/updater/update.service';
import { TxIconService } from '@app/shared/icons/tx-icon.service';

import { TxUpdateInstallOverlayComponent } from './tx-update-install-overlay.component';

describe('TxUpdateInstallOverlayComponent', () => {
  let fixture: ComponentFixture<TxUpdateInstallOverlayComponent>;

  const status = signal<UpdaterStatus>({
    state: 'downloaded',
    info: { version: '0.2.0-sim', devPreviewOnly: true },
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxUpdateInstallOverlayComponent],
      providers: [
        {
          provide: UpdateService,
          useValue: { status },
        },
        {
          provide: TxIconService,
          useValue: {
            loadIconInner: () => Promise.resolve('<path d="M12 3v12"/>'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TxUpdateInstallOverlayComponent);
    fixture.componentRef.setInput('visible', true);
  });

  it('renders installing copy with version', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const dialog = root.querySelector('.tx-update-install-overlay');
    expect(dialog?.textContent).toContain('Installing update');
    expect(dialog?.textContent).toContain('v0.2.0-sim');
    expect(dialog?.textContent).toContain('Please keep Testrix open');
    expect(dialog?.getAttribute('role')).toBe('alertdialog');
  });
});
