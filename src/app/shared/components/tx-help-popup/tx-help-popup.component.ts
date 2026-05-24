import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  HELP_WIKI_SECTIONS,
  findHelpWikiSection,
  helpWikiSidebarGroups,
  type HelpWikiSection,
  type HelpWikiSectionId,
} from '@shared/help';

import { TxIconComponent } from '../tx-icon/tx-icon.component';
import { TxInputComponent } from '../tx-input/tx-input.component';
import type { TxIconName } from '../../icons/tx-icon.registry';

import { HelpWikiSectionComponent } from './help-wiki-section.component';

@Component({
  selector: 'tx-help-popup',
  standalone: true,
  imports: [FormsModule, TxIconComponent, TxInputComponent, HelpWikiSectionComponent],
  templateUrl: './tx-help-popup.component.html',
  styleUrl: './tx-help-popup.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-help-popup-host',
  },
})
export class TxHelpPopupComponent {
  readonly open = input(false);
  readonly initialSectionId = input<HelpWikiSectionId | string | undefined>(undefined);
  readonly closed = output<void>();

  private readonly destroyRef = inject(DestroyRef);

  protected readonly isVisible = signal(false);
  protected readonly isShown = signal(false);
  protected readonly searchQuery = signal('');
  protected readonly activeSectionId = signal<HelpWikiSectionId>('getting-started');

  protected readonly sidebarGroups = helpWikiSidebarGroups;

  protected readonly filteredSidebarGroups = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) {
      return this.sidebarGroups();
    }

    return this.sidebarGroups()
      .map((group) => ({
        ...group,
        items: group.items.filter((section) => this.sectionMatchesQuery(section, query)),
      }))
      .filter((group) => group.items.length > 0);
  });

  protected readonly activeSection = computed((): HelpWikiSection => {
    const found = findHelpWikiSection(this.activeSectionId());
    return found ?? HELP_WIKI_SECTIONS[0]!;
  });

  private closeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      if (this.open()) {
        this.beginOpen();
        return;
      }

      if (this.isVisible()) {
        this.beginClose();
      }
    });

    this.destroyRef.onDestroy(() => this.cancelCloseTimer());
  }

  @HostListener('document:keydown.escape')
  protected handleEscape(): void {
    if (!this.open() || !this.isVisible()) {
      return;
    }

    this.handleClose();
  }

  protected handleBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.handleClose();
    }
  }

  protected handleClose(): void {
    if (!this.open() && !this.isVisible()) {
      return;
    }

    this.closed.emit();
  }

  protected selectSection(id: string): void {
    if (findHelpWikiSection(id)) {
      this.activeSectionId.set(id as HelpWikiSectionId);
    }
  }

  protected isSectionActive(id: string): boolean {
    return this.activeSectionId() === id;
  }

  protected handleSearchChange(value: string): void {
    this.searchQuery.set(value);
  }

  protected iconName(icon: string): TxIconName {
    return icon as TxIconName;
  }

  private beginOpen(): void {
    this.cancelCloseTimer();
    this.isVisible.set(true);
    this.searchQuery.set('');

    const initial = this.initialSectionId();
    if (initial && findHelpWikiSection(initial)) {
      this.activeSectionId.set(initial as HelpWikiSectionId);
    } else {
      this.activeSectionId.set('getting-started');
    }

    this.isShown.set(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (this.open()) {
          this.isShown.set(true);
        }
      });
    });
  }

  private beginClose(): void {
    this.isShown.set(false);
    this.cancelCloseTimer();
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      this.isVisible.set(false);
    }, this.popupCloseMs());
  }

  private cancelCloseTimer(): void {
    if (this.closeTimer !== null) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
  }

  private popupCloseMs(): number {
    const root = typeof document !== 'undefined' ? document.documentElement : null;
    const styles = root ? getComputedStyle(root) : null;
    const motionScale = styles ? Number.parseFloat(styles.getPropertyValue('--tx-motion-scale')) || 1 : 1;
    return Math.round(340 * motionScale);
  }

  private sectionMatchesQuery(section: HelpWikiSection, query: string): boolean {
    if (section.label.toLowerCase().includes(query) || section.title.toLowerCase().includes(query)) {
      return true;
    }

    if (section.description.toLowerCase().includes(query)) {
      return true;
    }

    return section.blocks.some((block) => {
      if ('text' in block && typeof block.text === 'string') {
        return block.text.toLowerCase().includes(query);
      }

      if (block.type === 'list') {
        return block.items.some((item) => item.toLowerCase().includes(query));
      }

      return false;
    });
  }
}
