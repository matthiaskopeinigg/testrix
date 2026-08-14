import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import {
  findComponentEntry,
  findPatternEntry,
  parsePatternSectionId,
} from '@app/core/design-system/design-system.registry';

@Component({
  selector: 'app-ds-patterns-panel',
  standalone: true,
  imports: [],
  templateUrl: './ds-patterns-panel.component.html',
  styleUrl: './ds-patterns-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DsPatternsPanelComponent {
  readonly sectionId = input.required<string>();
  readonly debugEnabled = input(false);

  protected readonly findComponentEntry = findComponentEntry;

  readonly entry = computed(() => {
    const id = parsePatternSectionId(this.sectionId());
    return id ? findPatternEntry(id) : undefined;
  });
}
