import { CONFIG_SCHEMA_VERSION } from './settings';
import {
  newServiceNodeId,
  parseUnknownTree,
  type ServiceTreeNode,
} from './service-tree';

export const PLANTUML_DIAGRAM_KINDS = [
  'sequence',
  'class',
  'activity',
  'usecase',
  'component',
  'state',
  'freeform',
] as const;

export type PlantumlDiagramKind = (typeof PLANTUML_DIAGRAM_KINDS)[number];

export interface PlantumlArtifactFields {
  readonly description: string;
  readonly tags: readonly string[];
  readonly diagramKind: PlantumlDiagramKind;
  /** Canonical PlantUML text. */
  readonly source: string;
  /** JSON-serialized builder model when not freeform; null for source-only. */
  readonly builderJson: string | null;
}

export type PlantumlNode = ServiceTreeNode<PlantumlArtifactFields>;

export interface PlantumlFile {
  readonly schemaVersion: number;
  readonly items: readonly PlantumlNode[];
}

export const DEFAULT_PLANTUML_SOURCE = `@startuml
Alice -> Bob : hello
@enduml`;

export const DEFAULT_PLANTUML_FILE: PlantumlFile = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  items: [],
};

export function isPlantumlDiagramKind(value: string): value is PlantumlDiagramKind {
  return (PLANTUML_DIAGRAM_KINDS as readonly string[]).includes(value);
}

export function emptyPlantumlArtifact(
  name = 'New diagram',
  diagramKind: Exclude<PlantumlDiagramKind, 'freeform'> = 'sequence',
): Extract<PlantumlNode, { kind: 'artifact' }> {
  const now = new Date().toISOString();
  return {
    kind: 'artifact',
    id: newServiceNodeId(),
    name,
    updatedAt: now,
    description: '',
    tags: [],
    diagramKind,
    source: DEFAULT_PLANTUML_SOURCE,
    builderJson: null,
  };
}

export function parsePlantumlFile(raw: unknown): PlantumlFile {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    items: parseUnknownTree(source['items'], (value) => {
      const kindRaw = typeof value['diagramKind'] === 'string' ? value['diagramKind'] : 'sequence';
      return {
        description: typeof value['description'] === 'string' ? value['description'] : '',
        tags: Array.isArray(value['tags'])
          ? value['tags'].filter((item): item is string => typeof item === 'string')
          : [],
        diagramKind: isPlantumlDiagramKind(kindRaw) ? kindRaw : 'sequence',
        source: typeof value['source'] === 'string' && value['source'].trim()
          ? value['source']
          : DEFAULT_PLANTUML_SOURCE,
        builderJson: typeof value['builderJson'] === 'string' ? value['builderJson'] : null,
      };
    }),
  };
}

/** Collect artifact ids from a plantuml tree (for session sanitize). */
export function collectPlantumlArtifactIds(items: readonly PlantumlNode[]): Set<string> {
  const ids = new Set<string>();
  const walk = (nodes: readonly PlantumlNode[]): void => {
    for (const node of nodes) {
      if (node.kind === 'artifact') {
        ids.add(node.id);
        continue;
      }
      walk(node.children as PlantumlNode[]);
    }
  };
  walk(items);
  return ids;
}
