import {
  WORKSPACE_EDITOR_LAYOUT_IDS,
  type WorkspaceEditorLayoutId,
} from '@shared/config';

import type { TxDropdownOption } from '../../tx-dropdown/tx-dropdown.types';

const WORKSPACE_EDITOR_LAYOUT_LABELS: Record<WorkspaceEditorLayoutId, string> = {
  sidebar: 'Sidebar section list',
  titlebar: 'Tabs under editor bar (Postman-style)',
};

export const WORKSPACE_EDITOR_LAYOUT_OPTIONS: readonly TxDropdownOption[] =
  WORKSPACE_EDITOR_LAYOUT_IDS.map((id) => ({
    value: id,
    label: WORKSPACE_EDITOR_LAYOUT_LABELS[id],
  }));
