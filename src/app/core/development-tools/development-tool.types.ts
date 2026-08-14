import type { DevelopmentToolId } from '@shared/config';

import type { TxIconName } from '@app/shared/icons';

/** Catalog entry for a development sidebar tool and workspace tab. */
export interface DevelopmentToolDefinition {
  readonly id: DevelopmentToolId;
  readonly label: string;
  readonly description: string;
  readonly icon: TxIconName;
}
