import type { BundleSelection } from '@shared/import-export';
import type { SettingsSectionKey, TestrixBundleSectionKey } from '@shared/import-export';

import type { CheckState, ImportExportNodePayload, ImportExportTreeNode } from './import-export-tree';

/** Computes tri-state checkbox value for a node from selected id sets. */
export function computeCheckState(
  node: ImportExportTreeNode,
  selected: Map<string, CheckState>,
): CheckState {
  const cached = selected.get(node.id);
  if (cached) {
    return cached;
  }
  if (!node.checkable || node.children.length === 0) {
    return 'off';
  }
  const childStates = node.children.map((c) => computeCheckState(c, selected));
  if (childStates.every((s) => s === 'on')) {
    return 'on';
  }
  if (childStates.every((s) => s === 'off')) {
    return 'off';
  }
  return 'partial';
}

function indexTree(nodes: readonly ImportExportTreeNode[]): Map<string, ImportExportTreeNode> {
  const map = new Map<string, ImportExportTreeNode>();
  const walk = (list: readonly ImportExportTreeNode[]): void => {
    for (const node of list) {
      map.set(node.id, node);
      if (node.children.length) {
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return map;
}

function collectDescendantIds(node: ImportExportTreeNode): string[] {
  const ids = [node.id];
  for (const child of node.children) {
    ids.push(...collectDescendantIds(child));
  }
  return ids;
}

/** Toggles a node and all descendants to the given state. */
export function applyToggle(
  node: ImportExportTreeNode,
  state: CheckState,
  selected: Map<string, CheckState>,
): void {
  const target = state === 'partial' ? 'on' : state;
  for (const id of collectDescendantIds(node)) {
    selected.set(id, target);
  }
}

/** Initializes all checkable nodes as selected (`on`). */
export function selectAllNodes(nodes: readonly ImportExportTreeNode[]): Map<string, CheckState> {
  const selected = new Map<string, CheckState>();
  const index = indexTree(nodes);
  for (const node of index.values()) {
    if (node.checkable) {
      selected.set(node.id, 'on');
    }
  }
  return selected;
}

function collectIdsByPayload(
  nodes: readonly ImportExportTreeNode[],
  selected: Map<string, CheckState>,
  match: (payload: ImportExportNodePayload) => boolean,
): Set<string> {
  const ids = new Set<string>();
  const walk = (list: readonly ImportExportTreeNode[]): void => {
    for (const node of list) {
      const state = selected.get(node.id) ?? 'off';
      if (state === 'on' && match(node.payload)) {
        if (node.payload.kind === 'collectionItem') {
          ids.add(node.payload.id);
        } else if (node.payload.kind === 'environment') {
          ids.add(node.payload.id);
        } else if (node.payload.kind === 'environmentItem') {
          ids.add(node.payload.id);
        } else if (node.payload.kind === 'testSuite') {
          ids.add(node.payload.id);
        } else if (node.payload.kind === 'testSuiteItem') {
          ids.add(node.payload.id);
        } else if (node.payload.kind === 'loadTestItem') {
          ids.add(node.payload.id);
        } else if (node.payload.kind === 'regressionItem') {
          ids.add(node.payload.id);
        } else if (node.payload.kind === 'mockItem') {
          ids.add(node.payload.id);
        }
      }
      if (node.children.length) {
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return ids;
}

function sectionEnabled(
  nodes: readonly ImportExportTreeNode[],
  selected: Map<string, CheckState>,
  section: TestrixBundleSectionKey,
): boolean {
  const group = nodes.find((n) => n.payload.kind === 'group' && n.payload.section === section);
  if (!group) {
    return false;
  }
  const state = selected.get(group.id) ?? computeCheckState(group, selected);
  return state === 'on' || state === 'partial';
}

/** Builds a {@link BundleSelection} from the tree checkbox state. */
export function buildBundleSelection(
  nodes: readonly ImportExportTreeNode[],
  selected: Map<string, CheckState>,
): BundleSelection {
  const sections = new Set<TestrixBundleSectionKey>();
  for (const node of nodes) {
    if (node.payload.kind !== 'group') {
      continue;
    }
    const state = selected.get(node.id) ?? computeCheckState(node, selected);
    if (state === 'on' || state === 'partial') {
      sections.add(node.payload.section);
    }
  }

  const cookiesGroup = sectionEnabled(nodes, selected, 'cookieJar');
  const cookiesLeaf =
    nodes
      .find((n) => n.payload.kind === 'group' && n.payload.section === 'cookieJar')
      ?.children.some((c) => selected.get(c.id) === 'on') ?? false;

  const settingsSections = new Set<SettingsSectionKey>();
  if (sectionEnabled(nodes, selected, 'settings')) {
    const settingsGroup = nodes.find((n) => n.payload.kind === 'group' && n.payload.section === 'settings');
    if (settingsGroup) {
      for (const child of settingsGroup.children) {
        if (
          child.payload.kind === 'settingsSection' &&
          (selected.get(child.id) === 'on' || computeCheckState(child, selected) === 'on')
        ) {
          settingsSections.add(child.payload.key);
        }
      }
    }
  }

  return {
    sections,
    collectionItems: collectIdsByPayload(nodes, selected, (p) => p.kind === 'collectionItem'),
    environments: collectIdsByPayload(nodes, selected, (p) => p.kind === 'environment'),
    environmentItems: collectIdsByPayload(nodes, selected, (p) => p.kind === 'environmentItem'),
    testSuites: collectIdsByPayload(nodes, selected, (p) => p.kind === 'testSuite'),
    testSuiteItems: collectIdsByPayload(nodes, selected, (p) => p.kind === 'testSuiteItem'),
    loadTests: collectIdsByPayload(nodes, selected, (p) => p.kind === 'loadTestItem'),
    regressions: collectIdsByPayload(nodes, selected, (p) => p.kind === 'regressionItem'),
    mockEndpoints: collectIdsByPayload(nodes, selected, (p) => p.kind === 'mockItem'),
    settingsSections,
    cookies: cookiesGroup && cookiesLeaf,
  };
}
