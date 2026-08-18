import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { TxIconName } from '@app/shared/icons';
import {
  WORKSPACE_SIDEBAR_USER_ITEM_ICONS,
  WORKSPACE_SIDEBAR_USER_ITEM_LABELS,
  moveWorkspaceSidebarItem,
  normalizeHiddenSidebarItems,
  normalizeSidebarItemOrder,
  toggleHiddenSidebarItem,
  type WorkspaceSidebarUserItemId,
} from '@shared/config';

import { TxButtonComponent } from '../../../forms/tx-button/tx-button.component';
import { TxIconComponent } from '../../../forms/tx-icon/tx-icon.component';
import { TxToggleComponent } from '../../../forms/tx-toggle/tx-toggle.component';

/** One configurable left-rail item in Settings. */
interface SidebarRailSettingsRow {
  readonly id: WorkspaceSidebarUserItemId;
  readonly label: string;
  readonly icon: TxIconName;
  readonly visible: boolean;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
}

/**
 * Settings list for left-rail sidebar item order and visibility.
 */

@Component({
  selector: 'tx-settings-sidebar-rail-section',
  standalone: true,
  imports: [FormsModule, TxButtonComponent, TxIconComponent, TxToggleComponent],
  templateUrl: './tx-settings-sidebar-rail-section.component.html',
  styleUrl: './tx-settings-sidebar-rail-section.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxSettingsSidebarRailSectionComponent {
  readonly order = input.required<readonly WorkspaceSidebarUserItemId[]>();
  readonly hidden = input.required<readonly WorkspaceSidebarUserItemId[]>();

  readonly orderChange = output<WorkspaceSidebarUserItemId[]>();
  readonly hiddenChange = output<WorkspaceSidebarUserItemId[]>();

  protected readonly rows = computed((): readonly SidebarRailSettingsRow[] => {
    const hidden = new Set(normalizeHiddenSidebarItems(this.hidden()));
    const mainOrder = normalizeSidebarItemOrder(this.order()).filter((id) => id !== 'history');
    const mainRows = mainOrder.map((id, index) => ({
      id,
      label: WORKSPACE_SIDEBAR_USER_ITEM_LABELS[id],
      icon: WORKSPACE_SIDEBAR_USER_ITEM_ICONS[id] as TxIconName,
      visible: !hidden.has(id),
      canMoveUp: index > 0,
      canMoveDown: index < mainOrder.length - 1,
    }));
    return [
      ...mainRows,
      {
        id: 'history',
        label: WORKSPACE_SIDEBAR_USER_ITEM_LABELS.history,
        icon: WORKSPACE_SIDEBAR_USER_ITEM_ICONS.history as TxIconName,
        visible: !hidden.has('history'),
        canMoveUp: false,
        canMoveDown: false,
      },
    ];
  });

  /**
   * Shows or hides a sidebar rail item.
   */
  protected handleVisibleChange(id: WorkspaceSidebarUserItemId, visible: boolean): void {
    this.hiddenChange.emit(toggleHiddenSidebarItem(this.hidden(), id, visible));
  }

  /**
   * Moves a sidebar rail item up or down.
   */
  protected handleMove(id: WorkspaceSidebarUserItemId, delta: -1 | 1): void {
    this.orderChange.emit(moveWorkspaceSidebarItem(this.order(), id, delta));
  }
}
