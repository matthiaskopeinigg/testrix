import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { HelpWikiSection } from '@shared/help';

import { TxBannerComponent } from '../tx-banner/tx-banner.component';

@Component({
  selector: 'help-wiki-section',
  standalone: true,
  imports: [TxBannerComponent],
  templateUrl: './help-wiki-section.component.html',
  styleUrl: './help-wiki-section.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpWikiSectionComponent {
  readonly section = input.required<HelpWikiSection>();
}
