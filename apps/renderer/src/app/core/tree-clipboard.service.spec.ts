import { describe, expect, it } from 'vitest'

import { TreeClipboardService, parseTreeClipboard } from './tree-clipboard.service'

describe('TreeClipboardService', () => {
  it('keeps a collection copy for a later paste', async () => {
    const clipboard = new TreeClipboardService()
    clipboard.set({
      kind: 'collections',
      nodes: [{ kind: 'http', id: 'http_1', name: 'Login', modifiedAt: '2026-01-01T00:00:00.000Z', method: 'GET', status: null }],
    })
    const pasted = await clipboard.get('collections')
    expect(pasted?.nodes[0]).toMatchObject({ name: 'Login' })
    expect(clipboard.peek('environments')).toBeNull()
    expect(clipboard.peek('service', 'flows')).toBeNull()
  })

  it('rejects a service paste into a different service', () => {
    const clipboard = new TreeClipboardService()
    clipboard.set({ kind: 'service', serviceId: 'flows', nodes: [{ kind: 'artifact', id: 'flow_1', name: 'Checkout', updatedAt: '2026-01-01T00:00:00.000Z' }] })
    expect(clipboard.peek('service', 'mocks')).toBeNull()
    expect(clipboard.peek('service', 'flows')?.nodes).toHaveLength(1)
  })
})

describe('parseTreeClipboard', () => {
  it('reads a prefixed payload and ignores other clipboard text', () => {
    expect(parseTreeClipboard({ kind: 'environments', items: [{ id: 'env_1' }] })?.kind).toBe('environments')
    expect(parseTreeClipboard({ kind: 'collections', nodes: [] })).toBeNull()
    expect(parseTreeClipboard('plain text')).toBeNull()
  })
})
