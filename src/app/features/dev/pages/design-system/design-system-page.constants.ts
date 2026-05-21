import type { DesignSystemPillar } from '@app/core/design-system/design-system.types';
import type { TxIconName } from '@app/shared/icons/tx-icon.registry';

/** Icon rail mapping for Design System pillar groups in the sidebar panel. */
export const DS_PILLAR_ICONS: Record<DesignSystemPillar, TxIconName> = {
  'style-guide': 'layers',
  brand: 'star',
  components: 'package',
  patterns: 'grid',
  'ui-kit': 'tool',
};
