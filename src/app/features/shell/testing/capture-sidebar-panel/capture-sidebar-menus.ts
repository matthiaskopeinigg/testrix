import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';
import {
  CAPTURE_SIDEBAR_FILTER_IDS,
  CAPTURE_SIDEBAR_SORT_BY_IDS,
  type CaptureSidebarFilter,
  type CaptureSidebarSortBy,
} from '@shared/config';

export function buildCaptureFilterMenuItems(kindFilter: CaptureSidebarFilter): TxContextMenuItem[] {
  return CAPTURE_SIDEBAR_FILTER_IDS.map((id) => kindFilterOption(id, kindFilter));
}

export function buildCaptureSortMenuItems(active: CaptureSidebarSortBy): TxContextMenuItem[] {
  return CAPTURE_SIDEBAR_SORT_BY_IDS.map((id) => sortOption(id, active));
}

export function isCaptureKindFilterAction(actionId: string): actionId is CaptureSidebarFilter {
  return (CAPTURE_SIDEBAR_FILTER_IDS as readonly string[]).includes(actionId);
}

export function isCaptureSortAction(actionId: string): actionId is CaptureSidebarSortBy {
  return (CAPTURE_SIDEBAR_SORT_BY_IDS as readonly string[]).includes(actionId);
}

function kindFilterOption(id: CaptureSidebarFilter, active: CaptureSidebarFilter): TxContextMenuItem {
  const labels: Record<CaptureSidebarFilter, { readonly label: string; readonly icon: TxContextMenuItem['icon'] }> =
    {
      all: { label: 'All items', icon: 'layers' },
      folders: { label: 'Folders only', icon: 'folder' },
      sessions: { label: 'Sessions only', icon: 'globe' },
    };
  const meta = labels[id];
  return { id, label: meta.label, icon: meta.icon, selected: active === id };
}

function sortOption(id: CaptureSidebarSortBy, active: CaptureSidebarSortBy): TxContextMenuItem {
  const labels: Record<CaptureSidebarSortBy, { readonly label: string; readonly icon: TxContextMenuItem['icon'] }> =
    {
      saved: { label: 'Saved order', icon: 'list' },
      'name-asc': { label: 'Name (A–Z)', icon: 'tag' },
      'name-desc': { label: 'Name (Z–A)', icon: 'tag' },
      'date-new': { label: 'Date modified (newest)', icon: 'clock' },
      'date-old': { label: 'Date modified (oldest)', icon: 'clock' },
    };
  const meta = labels[id];
  return { id, label: meta.label, icon: meta.icon, selected: active === id };
}
