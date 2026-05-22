import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { isTestSuiteFlow, isTestSuiteFolder, type TestSuiteTreeItem } from '@shared/testing';
import { testSuiteTabResourceId } from '@shared/testing';

import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';

export interface TestSuiteFolderCard {
  readonly id: string;
  readonly kind: 'folder' | 'flow';
  readonly name: string;
  readonly subtitle: string;
}

@Component({
  selector: 'app-test-suite-folder-tab',
  standalone: true,
  imports: [TxIconComponent],
  template: `
    @if (cards().length === 0) {
      <p class="test-suite-folder-tab__empty">This folder is empty. Add flows from the Test Suite sidebar.</p>
    } @else {
      <div class="test-suite-folder-tab__grid">
        @for (card of cards(); track card.id) {
          <button type="button" class="test-suite-folder-tab__card" (click)="openItem.emit(card)">
            <tx-icon [name]="card.kind === 'folder' ? 'folder' : 'play'" [size]="20" />
            <span class="test-suite-folder-tab__card-name">{{ card.name }}</span>
            <span class="test-suite-folder-tab__card-sub">{{ card.subtitle }}</span>
          </button>
        }
      </div>
    }
  `,
  styleUrl: './test-suite-folder-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TestSuiteFolderTabComponent {
  readonly children = input<readonly TestSuiteTreeItem[]>([]);

  readonly openItem = output<TestSuiteFolderCard>();

  protected readonly cards = computed((): readonly TestSuiteFolderCard[] =>
    this.children().map((item) => {
      if (isTestSuiteFlow(item)) {
        return {
          id: item.id,
          kind: 'flow' as const,
          name: item.name,
          subtitle: `${item.nodes.length} step(s)`,
        };
      }
      return {
        id: item.id,
        kind: 'folder' as const,
        name: item.name,
        subtitle: `${item.children.length} item(s)`,
      };
    }),
  );
}

export function folderCardResourceId(card: TestSuiteFolderCard): string {
  return testSuiteTabResourceId(card.kind, card.id);
}
