export type TxRailItemId = 'collections' | 'services' | 'database' | 'environments' | 'tools';

export type TxRailSlideDir = 'up' | 'down';

export interface TxRailItem {
  readonly id: TxRailItemId;
  readonly label: string;
  readonly soon: boolean;
}

export const DEFAULT_RAIL_ITEMS: readonly TxRailItem[] = [
  { id: 'collections', label: 'Collections', soon: true },
  { id: 'services', label: 'Services', soon: true },
  { id: 'database', label: 'Database', soon: false },
  { id: 'environments', label: 'Environments', soon: false },
  { id: 'tools', label: 'Tools', soon: false },
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
