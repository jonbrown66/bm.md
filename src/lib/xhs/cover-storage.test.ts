import type { XhsCoverDocument } from './cover-document'
import { describe, expect, it } from 'vitest'
import { createDefaultCoverDocument } from './cover-document'
import { createCoverStorage } from './cover-storage'

function createMemoryAdapter() {
  const records = new Map<string, unknown>()
  return {
    get: async (id: string) => records.get(id),
    put: async (id: string, document: XhsCoverDocument) => void records.set(id, document),
    delete: async (id: string) => void records.delete(id),
    setRaw: (id: string, value: unknown) => records.set(id, value),
  }
}

describe('xhs cover storage', () => {
  it('saves, reads, and deletes a cover by article id', async () => {
    const adapter = createMemoryAdapter()
    const storage = createCoverStorage(adapter)
    const document = createDefaultCoverDocument('# Memdex')

    await storage.save('article-1', document)
    expect(await storage.get('article-1')).toEqual(document)
    await storage.delete('article-1')
    expect(await storage.get('article-1')).toBeNull()
  })

  it('returns null for a damaged record', async () => {
    const adapter = createMemoryAdapter()
    adapter.setRaw('article-1', { version: 99 })

    expect(await createCoverStorage(adapter).get('article-1')).toBeNull()
  })
})
