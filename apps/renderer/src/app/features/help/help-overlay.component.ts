import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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

  readonly section = signal<HelpSectionId>('start');
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
    this.section.set(id);
    this.highlightId.set(null);
    this.query.set('');
  }

  openHit(id: string, section: HelpSectionId): void {
    this.section.set(section);
    this.highlightId.set(id);
    this.query.set('');
  }

  isHighlighted(id: string): boolean {
    return this.highlightId() === id;
  }
}
