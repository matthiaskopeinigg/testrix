export type TxRailItemId =
  | 'collections'
  | 'services'
  | 'database'
  | 'environments'
  | 'tools'
  | 'history';

export type TxRailSlideDir = 'up' | 'down';

export interface TxRailItem {
  readonly id: TxRailItemId;
  readonly label: string;
}

export const DEFAULT_RAIL_ITEMS: readonly TxRailItem[] = [
  { id: 'collections', label: 'Collections' },
  { id: 'services', label: 'Services' },
  { id: 'database', label: 'Database' },
  { id: 'environments', label: 'Environments' },
  { id: 'tools', label: 'Tools' },
  { id: 'history', label: 'History' },
];

/**
 * Rail order index used to pick a vertical slide direction between pages.
 */
export function railIndex(id: TxRailItemId): number {
  const index = DEFAULT_RAIL_ITEMS.findIndex((item) => item.id === id);
  return index < 0 ? 0 : index;
}

/**
 * Returns `down` when the next rail sits below the current one.
 */
export function railSlideDirection(from: TxRailItemId, to: TxRailItemId): TxRailSlideDir {
  return railIndex(to) > railIndex(from) ? 'down' : 'up';
}
