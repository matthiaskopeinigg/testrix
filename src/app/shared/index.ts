/** Shared UI surface used by shells and dialogs. */


export * from './components/tx-brand-logo/tx-brand-logo.component';


export * from './components/tx-error-banner/tx-error-banner.component';

export * from './components/tx-banner/tx-banner.component';

export * from './components/tx-update-banner/tx-update-banner.component';
export * from './components/tx-update-install-overlay/tx-update-install-overlay.component';

export * from './components/tx-notification/tx-notification.component';
export type { TxNotificationPayload, TxNotificationTone } from './components/tx-notification/tx-notification.types';
export * from './components/tx-notification-host/tx-notification-host.component';

export * from './components/tx-button/tx-button.component';

export * from './components/tx-modal/tx-modal.component';
export * from './components/tx-confirm-dialog/tx-confirm-dialog.component';

export * from './components/tx-form-field/tx-form-field.component';

export * from './components/tx-icon/tx-icon.component';

export * from './components/tx-theme-layout-preview/tx-theme-layout-preview.component';

export * from './components/tx-input/tx-input.component';

export * from './components/tx-inline-rename-input/tx-inline-rename-input.component';

export * from './components/tx-variable-input/tx-variable-input.component';

export * from './components/tx-key-value-list/tx-key-value-list.component';
export type { TxKeyValueRow } from './components/tx-key-value-list/tx-key-value-list.types';
export type { TxKeyValueListValueInput } from './components/tx-key-value-list/tx-key-value-list.component';

export * from './components/tx-key-value-description-list/tx-key-value-description-list.component';
export type { TxKeyValueDescriptionRow } from './components/tx-key-value-description-list/tx-key-value-description-list.types';
export type { TxKeyValueDescriptionListValueInput } from './components/tx-key-value-description-list/tx-key-value-description-list.component';

export * from './components/tx-dropdown/tx-dropdown.component';
export type { TxDropdownOption, TxDropdownPlacement } from './components/tx-dropdown/tx-dropdown.types';

export * from './components/tx-context-menu/tx-context-menu.component';
export type { TxContextMenuItem, TxContextMenuPosition } from './components/tx-context-menu/tx-context-menu.types';

export * from './components/tx-tag/tx-tag.component';
export * from './components/tx-tags-input/tx-tags-input.component';

export * from './components/tx-spinner/tx-spinner.component';

export * from './components/tx-workspace-tab-skeleton/tx-workspace-tab-skeleton.component';
export type { TxWorkspaceTabSkeletonVariant } from './components/tx-workspace-tab-skeleton/tx-workspace-tab-skeleton.component';

export * from './components/tx-toggle/tx-toggle.component';

export * from './components/tx-textarea/tx-textarea.component';

export * from './components/tx-code-editor/tx-code-editor.component';
export {
  TX_CODE_EDITOR_LANGUAGES,
  txCodeEditorLanguageLabel,
  txCodeEditorSupportsAutoFormat,
  type TxCodeEditorLanguage,
} from './components/tx-code-editor/tx-code-editor-language';
export * from './components/tx-code-editor/tx-code-editor-samples';

export * from './components/tx-slider/tx-slider.component';

export * from './components/tx-divider/tx-divider.component';

export * from './components/tx-tree/tx-tree.component';
export * from './components/tx-tree/tx-tree-node-template.directive';
export { mergeTxTreeConfig, type TxTreeConfigPartial } from './components/tx-tree/tx-tree.config';
export { TX_TREE_DEMO_NODES } from './components/tx-tree/tx-tree.sample';
export type {
  TxTreeConfig,
  TxTreeDragContext,
  TxTreeDragScope,
  TxTreeDropContext,
  TxTreeDropPosition,
  TxTreeNode,
  TxTreeNodeDropEvent,
  TxTreeNodeTemplateContext,
  TxTreeNodeClickEvent,
  TxTreeNodeRenameCommitEvent,
  TxTreeSelectionMode,
  TxTreeSiblingSort,
  TxTreeVisibleRow,
} from './components/tx-tree/tx-tree.types';
export { TX_TREE_DEFAULT_CONFIG } from './components/tx-tree/tx-tree.types';

export * from './components/tx-tooltip/tx-tooltip.component';
export * from './components/tx-tooltip/tx-tooltip.directive';
export type { TxTooltipPosition } from './components/tx-tooltip/tx-tooltip.types';

export * from './components/tx-tab/tx-tab.component';
export type { TxTabBarItem } from './components/tx-tab/tx-tab.types';

export * from './components/tx-tab-bar/tx-tab-bar.component';
export type {
  TxTabBarCrossDropEvent,
  TxTabBarDropEvent,
} from './components/tx-tab-bar/tx-tab-bar.component';

export * from './components/tx-split-pane/tx-split-pane.component';
export type { TxSplitPaneLeafContext } from './components/tx-split-pane/tx-split-pane.component';

export * from './components/tx-vertical-split-pane/tx-vertical-split-pane.component';
export * from './components/tx-horizontal-split-pane/tx-horizontal-split-pane.component';

export * from './components/tx-response-status-strip/tx-response-status-strip.component';

export * from './components/tx-response-tab-bar/tx-response-tab-bar.component';
export type { TxResponseTabItem } from './components/tx-response-tab-bar/tx-response-tab-bar.component';

export * from './components/tx-response-headers-list/tx-response-headers-list.component';

export * from './components/tx-response-timing-panel/tx-response-timing-panel.component';

export * from './components/tx-response-viewer/tx-response-viewer.component';

export * from './components/tx-cookie-manager/tx-cookie-manager.component';

export * from './components/tx-profile-manager-modal/tx-profile-manager-modal.component';

export * from './components/tx-run-timeline/tx-run-timeline.component';

export * from './components/tx-diff-view/tx-diff-view.component';

export * from './components/tx-sidebar/tx-sidebar.component';
export * from './components/tx-sidebar/tx-sidebar-panel-content.directive';
export type { TxSidebarItem } from './components/tx-sidebar/tx-sidebar.types';
export {
  TX_SIDEBAR_COLLAPSED_WIDTH_PX,
  TX_SIDEBAR_DEFAULT_WIDTH_PX,
  TX_SIDEBAR_MAX_WIDTH_PX,
  TX_SIDEBAR_MIN_WIDTH_PX,
  TX_SIDEBAR_PANEL_DEFAULT_WIDTH_PX,
  TX_SIDEBAR_PANEL_MAX_WIDTH_PX,
  TX_SIDEBAR_PANEL_MIN_WIDTH_PX,
  TX_SIDEBAR_RAIL_WIDTH_PX,
} from './components/tx-sidebar/tx-sidebar.types';

export * from './components/tx-settings-popup/tx-settings-popup.component';

export * from './components/tx-window-titlebar/tx-window-titlebar.component';

export * from './icons';


export * from './directives/tx-autofocus.directive';


export * from './pipes/truncate.pipe';
