import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CommandRegistryService,
  type Command,
} from '@app/core/commands/command-registry.service';
import { TxIconService } from '../../icons/tx-icon.service';

import { TxCommandPaletteComponent } from './tx-command-palette.component';

describe('TxCommandPaletteComponent', () => {
  let fixture: ComponentFixture<TxCommandPaletteComponent>;
  let commands$$: BehaviorSubject<Command[]>;

  beforeEach(async () => {
    commands$$ = new BehaviorSubject<Command[]>([
      {
        id: 'alpha',
        label: 'Alpha command',
        category: 'Test',
        run: vi.fn(),
      },
      {
        id: 'beta',
        label: 'Beta command',
        category: 'Test',
        run: vi.fn(),
      },
    ]);

    await TestBed.configureTestingModule({
      imports: [TxCommandPaletteComponent],
      providers: [
        {
          provide: CommandRegistryService,
          useValue: { commands$: commands$$.asObservable() },
        },
        {
          provide: TxIconService,
          useValue: { loadIconInner: () => Promise.resolve('<path d="M0 0"/>') },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TxCommandPaletteComponent);
  });

  it('renders search input and results when open', () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent ?? '';
    expect(text).toContain('Alpha command');
    expect(text).toContain('Beta command');
    expect(fixture.nativeElement.querySelector('tx-input')).toBeTruthy();
  });

  it('emits closed on Escape', () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);

    fixture.componentInstance['handleDocumentKeydown'](
      new KeyboardEvent('keydown', { key: 'Escape' }),
    );

    expect(closed).toHaveBeenCalled();
  });

  it('runs the active command on Enter', async () => {
    const run = vi.fn();
    commands$$.next([
      {
        id: 'run-me',
        label: 'Run me',
        run,
      },
    ]);

    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    fixture.componentInstance['handleDocumentKeydown'](
      new KeyboardEvent('keydown', { key: 'Enter' }),
    );
    await Promise.resolve();

    expect(run).toHaveBeenCalled();
  });
});
