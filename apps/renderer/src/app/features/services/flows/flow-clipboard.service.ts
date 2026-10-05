import { Injectable } from '@angular/core';

import type { FlowClipboardSlice } from './flow-graph-model';

const CLIPBOARD_PREFIX = 'testrix-flow-clipboard:v1:';

/**
 * Shared flow-node clipboard so copy in one scenario tab can paste in another.
 * Keeps an in-memory slice and mirrors JSON onto the system clipboard.
 */
@Injectable({ providedIn: 'root' })
export class FlowClipboardService {
  private slice: FlowClipboardSlice | null = null;

  set(slice: FlowClipboardSlice): void {
    this.slice = {
      nodes: structuredClone(slice.nodes),
      edges: structuredClone(slice.edges),
    };
    void this.writeSystem(this.slice);
  }

  async get(): Promise<FlowClipboardSlice | null> {
    const fromSystem = await this.readSystem();
    if (fromSystem)
      return fromSystem;
    return this.slice ? structuredClone(this.slice) : null;
  }

  private async writeSystem(slice: FlowClipboardSlice): Promise<void> {
    if (!navigator.clipboard?.writeText)
      return;
    try {
      await navigator.clipboard.writeText(`${CLIPBOARD_PREFIX}${JSON.stringify(slice)}`);
    } catch {
      /* clipboard may be denied; in-memory slice still works across tabs */
    }
  }

  private async readSystem(): Promise<FlowClipboardSlice | null> {
    if (!navigator.clipboard?.readText)
      return null;
    try {
      const text = await navigator.clipboard.readText();
      if (!text.startsWith(CLIPBOARD_PREFIX))
        return null;
      const parsed: unknown = JSON.parse(text.slice(CLIPBOARD_PREFIX.length));
      return parseClipboardSlice(parsed);
    } catch {
      return null;
    }
  }
}

function parseClipboardSlice(value: unknown): FlowClipboardSlice | null {
  if (!value || typeof value !== 'object')
    return null;
  const record = value as { nodes?: unknown; edges?: unknown };
  if (!Array.isArray(record.nodes) || !Array.isArray(record.edges))
    return null;
  if (record.nodes.length === 0)
    return null;
  return {
    nodes: structuredClone(record.nodes) as FlowClipboardSlice['nodes'],
    edges: structuredClone(record.edges) as FlowClipboardSlice['edges'],
  };
}
