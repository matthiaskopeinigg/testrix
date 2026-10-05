import {
  requestConfigOf,
  websocketConfigOf,
  requestViewFromTab,
  sanitizeSelectionEntry,
  type CollectionFolderNode,
  type CollectionNode,
  type DatabaseConnection,
  type DatabaseDiagramTabTarget,
  type DatabaseTableTabTarget,
  type Environment,
  type SavedDatabaseQuery,
  type SessionFile,
  type SessionGroup,
  type SessionListenerUi,
  type SessionInterceptUi,
  type SessionRequestView,
  type ServiceItem,
  type ToolItem,
  databaseConnectionTabNodeId,
  databaseDiagramTabNodeId,
  databaseQueryTabNodeId,
  databaseTableTabNodeId,
} from '@testrix/contracts';

import type { WorkbenchGroup, WorkbenchTab } from './workbench.store';

let tabSeq = 0;
let groupSeq = 0;
let environmentFocusSeq = 0;

/** Keeps new ids above any restored from a session, so tabs never collide. */
export function bumpIdSequences(groups: readonly SessionGroup[]): void {
  for (const group of groups) {
    const groupMatch = /^group-(\d+)$/.exec(group.id);
    if (groupMatch) {
      groupSeq = Math.max(groupSeq, Number(groupMatch[1]));
    }
    for (const tab of group.tabs) {
      const tabMatch = /-(\d+)$/.exec(tab.id);
      if (tabMatch) {
        tabSeq = Math.max(tabSeq, Number(tabMatch[1]));
      }
    }
  }
}

export function environmentFocusPatch(focusKey?: string): Pick<WorkbenchTab, 'environmentFocusKey' | 'environmentFocusNonce'> {
  const key = focusKey?.trim();
  if (!key)
    return {};
  environmentFocusSeq += 1;
  return { environmentFocusKey: key, environmentFocusNonce: environmentFocusSeq };
}

export function nextTabId(nodeId: string): string {
  tabSeq += 1;
  return `tab-${nodeId}-${tabSeq}`;
}

export function nextGroupId(): string {
  groupSeq += 1;
  return `group-${groupSeq}`;
}

export function mockUrlForNode(node: CollectionNode): string {
  const slug = node.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (node.kind === 'websocket') {
    return `wss://api.local/${slug || 'socket'}`;
  }
  return `https://api.local/${slug || 'request'}`;
}

export function tabFromNode(node: CollectionNode): WorkbenchTab | null {
  if (node.kind === 'http') {
    return {
      id: nextTabId(node.id),
      nodeId: node.id,
      kind: 'http',
      title: node.name,
      method: node.method,
      url: requestConfigOf(node).url || mockUrlForNode(node),
      status: node.status,
    };
  }
  if (node.kind === 'websocket') {
    return {
      id: nextTabId(node.id),
      nodeId: node.id,
      kind: 'websocket',
      title: node.name,
      url: websocketConfigOf(node).url || mockUrlForNode(node),
      status: null,
    };
  }
  return null;
}

export function tabFromFolder(node: CollectionFolderNode): WorkbenchTab {
  return {
    id: nextTabId(node.id),
    nodeId: node.id,
    kind: 'collection-folder',
    title: node.name,
    url: '',
    status: null,
  };
}

export function tabFromEnvironment(env: Environment): WorkbenchTab {
  return {
    id: nextTabId(env.id),
    nodeId: env.id,
    kind: 'environment',
    title: env.name,
    url: '',
    status: null,
  };
}

export function tabFromTool(tool: ToolItem): WorkbenchTab {
  return {
    id: nextTabId(tool.id),
    nodeId: tool.id,
    kind: 'tool',
    title: tool.label,
    url: '',
    status: null,
  };
}

export function tabFromService(service: ServiceItem): WorkbenchTab {
  return {
    id: nextTabId(service.id),
    nodeId: service.id,
    kind: 'service',
    title: service.label,
    url: '',
    status: null,
  };
}

export function tabFromEmulatorDevice(device: { readonly id: string; readonly name: string }): WorkbenchTab {
  return {
    id: nextTabId(device.id),
    nodeId: device.id,
    kind: 'emulator',
    title: device.name,
    url: '',
    status: null,
  };
}

export function tabFromDatabaseConnection(connection: DatabaseConnection): WorkbenchTab {
  return {
    id: nextTabId(connection.id),
    nodeId: databaseConnectionTabNodeId(connection.id),
    kind: 'database-connection',
    title: connection.name,
    url: '',
    status: null,
  };
}

export function tabFromDatabaseQuery(query: SavedDatabaseQuery): WorkbenchTab {
  return {
    id: nextTabId(query.id),
    nodeId: databaseQueryTabNodeId(query.id),
    kind: 'database-query',
    title: query.name,
    url: '',
    status: null,
  };
}

export function tabFromDatabaseTable(target: DatabaseTableTabTarget, title: string): WorkbenchTab {
  const nodeId = databaseTableTabNodeId(target);
  return {
    id: nextTabId(nodeId),
    nodeId,
    kind: 'database-table',
    title,
    url: '',
    status: null,
  };
}

export function tabFromDatabaseDiagram(target: DatabaseDiagramTabTarget, title: string): WorkbenchTab {
  const nodeId = databaseDiagramTabNodeId(target);
  return {
    id: nextTabId(nodeId),
    nodeId,
    kind: 'database-diagram',
    title,
    url: '',
    status: null,
  };
}

export function selectionForTabs(
  tabs: readonly WorkbenchTab[],
  ids: readonly string[],
  anchorId: string | null,
): Pick<WorkbenchGroup, 'selectedTabIds' | 'tabAnchorId'> {
  const cleaned = sanitizeSelectionEntry({ ids: [...ids], anchorId }, new Set(tabs.map((tab) => tab.id)));
  return { selectedTabIds: cleaned.ids, tabAnchorId: cleaned.anchorId };
}

export function viewsFromSession(session: SessionFile): Record<string, SessionRequestView> {
  const views: Record<string, SessionRequestView> = { ...(session.requestViewsByNodeId ?? {}) };
  for (const group of session.groups) {
    for (const tab of group.tabs) {
      const fromTab = requestViewFromTab(tab);
      if (Object.keys(fromTab).length === 0)
        continue;
      views[tab.nodeId] = { ...views[tab.nodeId], ...fromTab };
    }
  }
  return views;
}

export function listenerUiFromSession(session: SessionFile): Record<string, SessionListenerUi> {
  const next: Record<string, SessionListenerUi> = {};
  for (const [id, ui] of Object.entries(session.listenerUiById ?? {})) {
    next[id] = {
      search: ui.search ?? '',
      sort: ui.sort ?? 'time-desc',
    };
  }
  return next;
}

export function interceptUiFromSession(session: SessionFile): Record<string, SessionInterceptUi> {
  const next: Record<string, SessionInterceptUi> = {};
  for (const [id, ui] of Object.entries(session.interceptUiById ?? {})) {
    next[id] = {
      search: ui.search ?? '',
      sort: ui.sort ?? 'time-desc',
    };
  }
  return next;
}

/** Merges durable per-node sections with sections from currently open tabs. */
export function serviceSectionsFromSession(session: SessionFile): Record<string, string> {
  const sections: Record<string, string> = { ...(session.serviceSectionByNodeId ?? {}) };
  for (const group of session.groups) {
    for (const tab of group.tabs) {
      if (tab.serviceSection)
        sections[tab.nodeId] = tab.serviceSection;
    }
  }
  return sections;
}

export function groupFromSession(group: SessionGroup): WorkbenchGroup {
  return {
    id: group.id,
    tabs: group.tabs.map((tab) => ({ ...tab })),
    activeTabId: group.activeTabId,
    ...selectionForTabs(group.tabs, group.selectedTabIds ?? [], group.tabAnchorId ?? null),
  };
}

/** Preview while dragging a tab onto a split drop zone. */
