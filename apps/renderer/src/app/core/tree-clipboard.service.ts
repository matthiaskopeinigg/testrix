import { Injectable } from '@angular/core'
import type {
  CollectionNode,
  Environment,
  FlowGraphTemplate,
  PlantumlNode,
  ServiceId,
  ServiceTreeNode,
} from '@testrix/contracts'

const CLIPBOARD_PREFIX = 'testrix-tree-clipboard:v1:'

export type TreeClipboardPayload =
  | { readonly kind: 'collections'; readonly nodes: readonly CollectionNode[] }
  | { readonly kind: 'environments'; readonly items: readonly Environment[] }
  | {
      readonly kind: 'database'
      readonly section: 'connections' | 'queries'
      readonly nodes: readonly unknown[]
    }
  | {
      readonly kind: 'service'
      readonly serviceId: ServiceId
      readonly nodes: readonly ServiceTreeNode<Record<string, unknown>>[]
    }
  | { readonly kind: 'plantuml'; readonly nodes: readonly PlantumlNode[] }
  | { readonly kind: 'flow-templates'; readonly templates: readonly FlowGraphTemplate[] }

/**
 * Sidebar clipboard that survives a workspace switch.
 * The in-memory payload is the source of truth in this window. A system-clipboard
 * copy covers a later paste after the renderer restarts.
 */
@Injectable({ providedIn: 'root' })
export class TreeClipboardService {
  private payload: TreeClipboardPayload | null = null

  set(payload: TreeClipboardPayload): void {
    this.payload = structuredClone(payload)
    void this.writeSystem(this.payload)
  }

  peek<K extends TreeClipboardPayload['kind']>(
    kind: K,
    serviceId?: string,
  ): Extract<TreeClipboardPayload, { kind: K }> | null {
    return matchPayload(this.payload, kind, serviceId)
  }

  async get<K extends TreeClipboardPayload['kind']>(
    kind: K,
    serviceId?: string,
  ): Promise<Extract<TreeClipboardPayload, { kind: K }> | null> {
    const memory = this.peek(kind, serviceId)
    if (memory)
      return memory
    const fromSystem = await this.readSystem()
    return matchPayload(fromSystem, kind, serviceId)
  }

  private async writeSystem(payload: TreeClipboardPayload): Promise<void> {
    if (!navigator.clipboard?.writeText)
      return
    try {
      await navigator.clipboard.writeText(`${CLIPBOARD_PREFIX}${JSON.stringify(payload)}`)
    } catch {
      /* clipboard may be denied; the in-memory payload still covers this window */
    }
  }

  private async readSystem(): Promise<TreeClipboardPayload | null> {
    if (!navigator.clipboard?.readText)
      return null
    try {
      const text = await navigator.clipboard.readText()
      if (!text.startsWith(CLIPBOARD_PREFIX))
        return null
      return parseTreeClipboard(JSON.parse(text.slice(CLIPBOARD_PREFIX.length)))
    } catch {
      return null
    }
  }
}

function matchPayload<K extends TreeClipboardPayload['kind']>(
  payload: TreeClipboardPayload | null,
  kind: K,
  serviceId?: string,
): Extract<TreeClipboardPayload, { kind: K }> | null {
  if (!payload || payload.kind !== kind)
    return null
  if (payload.kind === 'service' && serviceId && payload.serviceId !== serviceId)
    return null
  return structuredClone(payload) as Extract<TreeClipboardPayload, { kind: K }>
}

export function parseTreeClipboard(value: unknown): TreeClipboardPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return null
  const record = value as { kind?: unknown; nodes?: unknown; items?: unknown; templates?: unknown; serviceId?: unknown; section?: unknown }
  if (record.kind === 'collections' && Array.isArray(record.nodes) && record.nodes.length > 0)
    return structuredClone(record) as TreeClipboardPayload
  if (record.kind === 'environments' && Array.isArray(record.items) && record.items.length > 0)
    return structuredClone(record) as TreeClipboardPayload
  if (
    record.kind === 'database' &&
    (record.section === 'connections' || record.section === 'queries') &&
    Array.isArray(record.nodes) &&
    record.nodes.length > 0
  )
    return structuredClone(record) as TreeClipboardPayload
  if (
    record.kind === 'service' &&
    typeof record.serviceId === 'string' &&
    Array.isArray(record.nodes) &&
    record.nodes.length > 0
  )
    return structuredClone(record) as TreeClipboardPayload
  if (record.kind === 'plantuml' && Array.isArray(record.nodes) && record.nodes.length > 0)
    return structuredClone(record) as TreeClipboardPayload
  if (record.kind === 'flow-templates' && Array.isArray(record.templates) && record.templates.length > 0)
    return structuredClone(record) as TreeClipboardPayload
  return null
}
