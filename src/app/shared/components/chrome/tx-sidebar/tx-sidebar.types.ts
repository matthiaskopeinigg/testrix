import type { TxIconName } from '@app/shared/icons';

/** Single navigational entry in {@link TxSidebarComponent}. */
export interface TxSidebarItem {
  readonly id: string;
  readonly label: string;
  readonly icon: TxIconName;
  readonly disabled?: boolean;
  /** When false, click runs {@link TxSidebarComponent.itemSelect} without opening the panel. */
  readonly opensPanel?: boolean;
}

/** Fixed width of the icon activity rail. */
export const TX_SIDEBAR_RAIL_WIDTH_PX = 56;

/** Default width of the contextual panel beside the rail. */
export const TX_SIDEBAR_PANEL_DEFAULT_WIDTH_PX = 300;

/** Minimum contextual panel width while resizing. */
export const TX_SIDEBAR_PANEL_MIN_WIDTH_PX = 220;

/** Maximum contextual panel width while resizing. */
export const TX_SIDEBAR_PANEL_MAX_WIDTH_PX = 480;

/** @deprecated Use {@link TX_SIDEBAR_RAIL_WIDTH_PX}. */
export const TX_SIDEBAR_COLLAPSED_WIDTH_PX = TX_SIDEBAR_RAIL_WIDTH_PX;

/** @deprecated Use {@link TX_SIDEBAR_PANEL_DEFAULT_WIDTH_PX}. */
export const TX_SIDEBAR_DEFAULT_WIDTH_PX = TX_SIDEBAR_PANEL_DEFAULT_WIDTH_PX;

/** @deprecated Use {@link TX_SIDEBAR_PANEL_MIN_WIDTH_PX}. */
export const TX_SIDEBAR_MIN_WIDTH_PX = TX_SIDEBAR_PANEL_MIN_WIDTH_PX;

/** @deprecated Use {@link TX_SIDEBAR_PANEL_MAX_WIDTH_PX}. */
export const TX_SIDEBAR_MAX_WIDTH_PX = TX_SIDEBAR_PANEL_MAX_WIDTH_PX;
