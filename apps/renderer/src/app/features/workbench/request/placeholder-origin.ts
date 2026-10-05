import { InjectionToken } from '@angular/core';
import {
  environmentVariableMap,
  type CollectionKvRow,
  type EnvironmentNode,
} from '@testrix/contracts';

import type { CollectionsStore } from '../../collections/collections.store';
import type { EnvironmentsStore } from '../../environments/environments.store';
import type { WorkbenchStore } from '../workbench.store';

/** Folder, environment, or flow data column that currently wins for a `{{name}}` substitution. */
export interface PlaceholderOrigin {
  readonly name: string;
  readonly kind: 'folder' | 'environment' | 'data';
  readonly sourceId: string;
  readonly sourceName: string;
}

/** Click payload for a highlighted placeholder. */
export interface PlaceholderActivate {
  readonly kind: 'folder' | 'environment' | 'path' | 'data';
  readonly name: string;
  readonly sourceId: string;
  readonly sourceName: string;
}

/** Shift+left-click opens the origin; a plain click only shows the hover hint. */
export function shouldOpenPlaceholderOrigin(event: MouseEvent): boolean {
  return event.shiftKey && event.button === 0;
}

/** Hint suffix for clickable placeholder chips. */
export function placeholderOpenHint(base: string): string {
  return `${base} · Shift+click to open`;
}

export interface VariableSourceFolder {
  readonly id: string;
  readonly name: string;
  readonly variables: readonly CollectionKvRow[];
}

/** Host that can resolve and open the source of a placeholder chip. */
export interface PlaceholderOriginHost {
  placeholderOrigins(): readonly PlaceholderOrigin[];
  openPlaceholder(activate: PlaceholderActivate): void;
}

export const PLACEHOLDER_ORIGIN_HOST = new InjectionToken<PlaceholderOriginHost>('PLACEHOLDER_ORIGIN_HOST');

/**
 * Winning `{{var}}` sources: environment first, then folders root→leaf so the
 * nearest folder overlays the environment (same order as Send).
 */
export function winningVariableOrigins(input: {
  readonly folders: readonly VariableSourceFolder[];
  readonly environment?: { readonly id: string; readonly name: string; readonly variables: readonly EnvironmentNode[] } | null;
}): PlaceholderOrigin[] {
  const byKey = new Map<string, PlaceholderOrigin>();
  const put = (name: string, origin: PlaceholderOrigin): void => {
    const key = name.trim();
    if (!key)
      return;
    byKey.set(key.toLowerCase(), { ...origin, name: key });
  };
  if (input.environment) {
    const env = input.environment;
    for (const key of Object.keys(environmentVariableMap(env.variables))) {
      put(key, {
        name: key,
        kind: 'environment',
        sourceId: env.id,
        sourceName: env.name,
      });
    }
  }
  for (const folder of input.folders) {
    for (const row of folder.variables) {
      if (!row.enabled || !row.key.trim())
        continue;
      put(row.key, {
        name: row.key.trim(),
        kind: 'folder',
        sourceId: folder.id,
        sourceName: folder.name,
      });
    }
  }
  return [...byKey.values()];
}

export function originForName(
  origins: readonly PlaceholderOrigin[],
  name: string,
): PlaceholderOrigin | undefined {
  const needle = name.trim();
  if (!needle)
    return undefined;
  return (
    origins.find((item) => item.name === needle) ??
    origins.find((item) => item.name.toLowerCase() === needle.toLowerCase())
  );
}

export function hintForVariableOrigin(origin: PlaceholderOrigin | undefined): string {
  if (!origin)
    return 'Unknown variable';
  if (origin.kind === 'folder')
    return `Folder · ${origin.sourceName}`;
  if (origin.kind === 'data')
    return `Data · ${origin.sourceName}`;
  return `Environment · ${origin.sourceName}`;
}

export function placeholderActivateFromDataset(node: Element): PlaceholderActivate | null {
  const kind = node.getAttribute('data-tx-ph-kind');
  if (kind !== 'folder' && kind !== 'environment' && kind !== 'path' && kind !== 'data')
    return null;
  return {
    kind,
    name: node.getAttribute('data-tx-ph-key') ?? '',
    sourceId: node.getAttribute('data-tx-ph-id') ?? '',
    sourceName: node.getAttribute('data-tx-ph-name') ?? '',
  };
}

/** Opens the folder Variables tab or environment editor that owns a variable. */
export function openPlaceholderOrigin(
  activate: PlaceholderActivate,
  deps: {
    readonly collections: CollectionsStore;
    readonly workbench: WorkbenchStore;
    readonly environments: EnvironmentsStore;
  },
): void {
  if (activate.kind === 'path' || activate.kind === 'data')
    return;
  if (activate.kind === 'folder') {
    const folder = deps.collections.folderById(activate.sourceId);
    if (folder)
      deps.workbench.openFromCollectionFolder(folder, 'variables');
    return;
  }
  const env =
    deps.environments.items().find((item) => item.id === activate.sourceId) ??
    deps.environments.items().find((item) => item.id === deps.environments.activeId());
  if (env)
    deps.workbench.openFromEnvironment(env, activate.name);
}
