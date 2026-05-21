import {
  HTTP_METHOD_DISPLAY_IDS,
  type HttpMethodDisplayId,
} from '@shared/config';

import type { TxDropdownOption } from '../../tx-dropdown/tx-dropdown.types';

const HTTP_METHOD_DISPLAY_LABELS: Record<HttpMethodDisplayId, string> = {
  'tree-and-tab': 'Tree and tab',
  tree: 'Tree only',
  tab: 'Tab only',
  never: 'Never',
};

export const HTTP_METHOD_DISPLAY_OPTIONS: readonly TxDropdownOption[] =
  HTTP_METHOD_DISPLAY_IDS.map((id) => ({
    value: id,
    label: HTTP_METHOD_DISPLAY_LABELS[id],
  }));
