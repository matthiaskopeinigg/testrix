import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { TxHintComponent, TxOverlayComponent, TxOverlayHostDirective } from '@testrix/ui';

import { DesktopApiService } from '../../core/desktop-api.service';
import { ShellStateService } from '../../core/shell-state.service';
import {
  HELP_NAV,
  HELP_NAV_GROUPS,
  articlesForSection,
  filterHelpHits,
  type HelpSectionId,
} from './help-registry';
import { HelpContextService } from './help-context.service';

@Component({
  selector: 'tx-help-overlay',
  standalone: true,
  imports: [TxOverlayComponent, TxHintComponent],
  templateUrl: './help-overlay.component.html',
  styleUrl: './help-overlay.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [TxOverlayHostDirective],
})
export class HelpOverlayComponent {
  readonly desktop = inject(DesktopApiService);
  readonly shell = inject(ShellStateService);
  private readonly helpContext = inject(HelpContextService);

  readonly section = signal<HelpSectionId>('start');
  readonly paneSlideDir = signal<'up' | 'down' | null>(null);
  readonly query = signal('');
  readonly highlightId = signal<string | null>(null);
  readonly nav = HELP_NAV;
  readonly groups = HELP_NAV_GROUPS;

  readonly hits = computed(() => filterHelpHits(this.query()));
  readonly matchingSections = computed(() => new Set(this.hits().map((hit) => hit.section)));
  readonly articles = computed(() => articlesForSection(this.section()));
  readonly title = computed(() => {
    if (this.query().trim())
      return 'Search';
    return this.nav.find((item) => item.id === this.section())?.label ?? 'Help';
  });
  readonly subtitle = computed(() => {
    if (this.query().trim())
      return 'Jump to a matching topic.';
    return this.nav.find((item) => item.id === this.section())?.summary ?? '';
  });

  constructor() {
    effect(() => {
      if (!this.shell.helpOpen())
        return;
      const target = this.shell.helpTarget() ?? this.helpContext.contextualTarget();
      this.section.set(target.section);
      this.highlightId.set(target.articleId ?? null);
      this.query.set('');
    });
  }

  handleSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  navItemsFor(groupIds: readonly HelpSectionId[]) {
    return this.nav.filter((item) => groupIds.includes(item.id));
  }

  isNavQuiet(id: HelpSectionId): boolean {
    return this.query().trim().length > 0 && !this.matchingSections().has(id);
  }

  sectionLabel(id: HelpSectionId): string {
    return this.nav.find((item) => item.id === id)?.label ?? id;
  }

  selectSection(id: HelpSectionId): void {
    if (id === this.section() && !this.query().trim())
      return;
    this.paneSlideDir.set(this.slideDirTo(id));
    this.section.set(id);
    this.highlightId.set(null);
    this.query.set('');
  }

  openHit(id: string, section: HelpSectionId): void {
    this.paneSlideDir.set(this.slideDirTo(section));
    this.section.set(section);
    this.highlightId.set(id);
    this.query.set('');
  }

  paneEnter(): string | undefined {
    return this.paneSlideDir() ? 'tx-sidebar-pane-in' : undefined;
  }

  private slideDirTo(id: HelpSectionId): 'up' | 'down' {
    const from = this.nav.findIndex((item) => item.id === this.section());
    const to = this.nav.findIndex((item) => item.id === id);
    return to > from ? 'down' : 'up';
  }

  isHighlighted(id: string): boolean {
    return this.highlightId() === id;
  }
}
