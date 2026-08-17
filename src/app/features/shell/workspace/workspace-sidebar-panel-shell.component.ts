import { ChangeDetectionStrategy, Component, ElementRef, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { TxDividerComponent } from '@app/shared/components/forms/tx-divider/tx-divider.component';
import { TxIconComponent } from '@app/shared/components/forms/tx-icon/tx-icon.component';
import { TxInputComponent } from '@app/shared/components/forms/tx-input/tx-input.component';
import { TxTooltipDirective } from '@app/shared/components/overlays/tx-tooltip/tx-tooltip.directive';
import { TxSidebarToolbarDirective } from '@app/shared/components/chrome/tx-sidebar/tx-sidebar-panel-content.directive';
import { dispatchEmptyAreaContextMenu } from '@app/shared/components/chrome/tx-sidebar/dispatch-empty-area-context-menu';


/**
 * Standard workspace sidebar panel chrome: search, folder expand/collapse, filter, and sort.
 * Body is projected for future tree/lists; empty by default.
 */
@Component({
  selector: 'app-workspace-sidebar-panel-shell',
  standalone: true,
  imports: [
    FormsModule,
    TxDividerComponent,
    TxInputComponent,
    TxIconComponent,
    TxTooltipDirective,
    TxSidebarToolbarDirective,
  ],
  templateUrl: './workspace-sidebar-panel-shell.component.html',
  styleUrl: './workspace-sidebar-panel-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceSidebarPanelShellComponent {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly searchPlaceholder = input('Search…');
  readonly searchAriaLabel = input('Search');
  /** When false, hides the expand/collapse-all control (e.g. panels without folders). */
  readonly showFolderToggle = input(true);
  /** When false, hides the default filter button (use projected toolbar actions). */
  readonly showFilterButton = input(true);
  /** When false, hides the default sort button (use projected toolbar actions). */
  readonly showSortButton = input(true);
  /** When false, use projected `[workspacePanelToolbarActions]` instead of default filter/sort buttons. */
  readonly useDefaultToolbarActions = input(true);
  /** Controlled expand/collapse-all state for folder trees in the panel body. */
  readonly allFoldersExpanded = input(true);
  readonly allFoldersExpandedChange = output<boolean>();
  readonly searchChange = output<string>();

  protected readonly searchQuery = signal('');

  protected handleSearchChange(value: string): void {
    this.searchQuery.set(value);
    this.searchChange.emit(value);
  }

  protected handleToggleFolders(): void {
    this.allFoldersExpandedChange.emit(!this.allFoldersExpanded());
  }

  /** Mock toolbar action. */
  protected handleFilter(): void {
    // Placeholder for filter popover
  }

  /** Mock toolbar action. */
  protected handleSort(): void {
    // Placeholder for sort popover
  }

  /**
   * Right-click on toolbar chrome (not the search field or icon buttons) opens the
   * same empty-area tree menu as leftover space below the last row.
   */
  protected handleChromeContextMenu(event: MouseEvent): void {
    dispatchEmptyAreaContextMenu(event, this.host.nativeElement);
  }
}
