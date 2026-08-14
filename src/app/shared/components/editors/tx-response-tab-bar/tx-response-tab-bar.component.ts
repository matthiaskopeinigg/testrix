import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { RequestResponseTabId } from '@shared/config/request-runs-session.schema';

export interface TxResponseTabItem {
  readonly id: RequestResponseTabId;
  readonly label: string;
  readonly badge?: number;
  readonly visible?: boolean;
}

@Component({
  selector: 'tx-response-tab-bar',
  standalone: true,
  template: `
    <nav class="tx-response-tab-bar" role="tablist" aria-label="Response views">
      @for (tab of visibleTabs(); track tab.id) {
        <button
          type="button"
          role="tab"
          class="tx-response-tab-bar__tab"
          [class.is-active]="activeTab() === tab.id"
          [attr.aria-selected]="activeTab() === tab.id"
          (click)="handleTabClick(tab.id)"
        >
          <span>{{ tab.label }}</span>
          @if (tab.badge !== undefined && tab.badge > 0) {
            <span class="tx-response-tab-bar__badge">{{ tab.badge }}</span>
          }
        </button>
      }
    </nav>
  `,
  styleUrl: './tx-response-tab-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxResponseTabBarComponent {
  readonly tabs = input<readonly TxResponseTabItem[]>([]);
  readonly activeTab = input<RequestResponseTabId>('body');
  readonly activeTabChange = output<RequestResponseTabId>();

  protected visibleTabs(): readonly TxResponseTabItem[] {
    return this.tabs().filter((t) => t.visible !== false);
  }

  protected handleTabClick(id: RequestResponseTabId): void {
    this.activeTabChange.emit(id);
  }
}
