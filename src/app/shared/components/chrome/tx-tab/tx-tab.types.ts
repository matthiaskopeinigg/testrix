import type { TxIconName } from '@app/shared/icons';

/** View model for a single tab in {@link TxTabBarComponent}. */
export interface TxTabBarItem {
  readonly id: string;
  readonly label: string;
  readonly active?: boolean;
  readonly pinned?: boolean;
  readonly dirty?: boolean;
  /** Kind icon (request → http, folder → folder, …). */
  readonly icon?: TxIconName;
  /** HTTP method badge for request tabs. */
  readonly method?: string;
}
