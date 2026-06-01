import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';

import {
  CommandRegistryService,
  searchCommands,
  type Command,
  type CommandSearchResult,
} from '@app/core/commands/command-registry.service';

import { TxIconComponent } from '../tx-icon/tx-icon.component';
import { TxInputComponent } from '../tx-input/tx-input.component';
import { TxTagComponent } from '../tx-tag/tx-tag.component';

const MAX_RESULTS = 50;

/**
 * Global command palette. Opens from shell layout via {@link CommandPaletteService}.
 * Filters commands with subsequence fuzzy search; arrow keys navigate, Enter runs.
 */
@Component({
  selector: 'tx-command-palette',
  standalone: true,
  imports: [FormsModule, TxIconComponent, TxInputComponent, TxTagComponent],
  templateUrl: './tx-command-palette.component.html',
  styleUrl: './tx-command-palette.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-command-palette-host',
  },
})
export class TxCommandPaletteComponent {
  readonly open = input(false);
  readonly closed = output<void>();

  private readonly destroyRef = inject(DestroyRef);
  private readonly registry = inject(CommandRegistryService);

  private readonly searchHost = viewChild<ElementRef<HTMLElement>>('searchHost');

  protected readonly query = signal('');
  protected readonly activeIndex = signal(0);
  private readonly commands = signal<Command[]>([]);

  protected readonly results = computed((): readonly CommandSearchResult[] =>
    searchCommands(this.query(), this.commands()).slice(0, MAX_RESULTS),
  );

  constructor() {
    this.registry.commands$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((cmds) => {
        this.commands.set(cmds);
      });

    effect(() => {
      if (!this.open()) {
        return;
      }
      this.query.set('');
      this.activeIndex.set(0);
      queueMicrotask(() => this.focusSearch());
    });
  }

  protected handleBackdropClick(): void {
    this.emitClosed();
  }

  protected handleShellClick(event: MouseEvent): void {
    event.stopPropagation();
  }

  protected handleQueryChange(value: string): void {
    this.query.set(value);
    this.activeIndex.set(0);
  }

  protected handleItemHover(index: number): void {
    this.activeIndex.set(index);
  }

  protected async handleItemClick(index: number): Promise<void> {
    this.activeIndex.set(index);
    await this.runActive();
  }

  @HostListener('document:keydown', ['$event'])
  protected handleDocumentKeydown(event: KeyboardEvent): void {
    if (!this.open()) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.emitClosed();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const count = this.results().length;
      if (count > 0) {
        this.activeIndex.update((i) => (i + 1) % count);
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const count = this.results().length;
      if (count > 0) {
        this.activeIndex.update((i) => (i - 1 + count) % count);
      }
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      void this.runActive();
    }
  }

  private async runActive(): Promise<void> {
    const picked = this.results()[this.activeIndex()];
    if (!picked) {
      return;
    }
    this.emitClosed();
    try {
      await picked.command.run();
    } catch (error: unknown) {
      console.error('Command failed:', picked.command.id, error);
    }
  }

  private emitClosed(): void {
    this.closed.emit();
  }

  private focusSearch(): void {
    const host = this.searchHost()?.nativeElement;
    const input = host?.querySelector('input');
    input?.focus({ preventScroll: true });
  }
}
