import type { IDBPDatabase } from 'idb'
import type { XhsCoverDocument } from './cover-document'
import { openDB } from 'idb'
import { parseCoverDocument } from './cover-document'

interface CoverRecord {
  id: string
  document: XhsCoverDocument
  updatedAt: number
}

interface CoverDB {
  covers: {
    key: string
    value: CoverRecord
  }
}

export interface CoverStorageAdapter {
  get: (id: string) => Promise<unknown>
  put: (id: string, document: XhsCoverDocument) => Promise<void>
  delete: (id: string) => Promise<void>
}

export function createCoverStorage(adapter: CoverStorageAdapter) {
  return {
    async get(id: string) {
      return parseCoverDocument(await adapter.get(id))
    },
    async save(id: string, document: XhsCoverDocument) {
      await adapter.put(id, document)
    },
    async delete(id: string) {
      await adapter.delete(id)
    },
  }
}

const memoryFallback = new Map<string, XhsCoverDocument>()
let database: Promise<IDBPDatabase<CoverDB>> | null = null
let unavailableReason = ''

function getDatabase() {
  database ??= openDB<CoverDB>('bm.md.xhs-covers', 1, {
    upgrade(db) {
      db.createObjectStore('covers', { keyPath: 'id' })
    },
  }).catch((error) => {
    database = null
    unavailableReason = error instanceof Error ? error.message : '浏览器存储不可用'
    throw error
  })

  return database
}

const defaultAdapter: CoverStorageAdapter = {
  async get(id) {
    try {
      const db = await getDatabase()
      return (await db.get('covers', id))?.document ?? memoryFallback.get(id)
    }
    catch {
      return memoryFallback.get(id)
    }
  },
  async put(id, document) {
    memoryFallback.set(id, document)
    const db = await getDatabase()
    await db.put('covers', { id, document, updatedAt: Date.now() })
  },
  async delete(id) {
    memoryFallback.delete(id)
    try {
      const db = await getDatabase()
      await db.delete('covers', id)
    }
    catch {
      // 文章删除不能被封面存储失败阻塞。
    }
  },
}

const coverStorage = createCoverStorage(defaultAdapter)

export function getCoverDocument(id: string) {
  return coverStorage.get(id)
}

export function saveCoverDocument(id: string, document: XhsCoverDocument) {
  return coverStorage.save(id, document)
}

export function deleteCoverDocument(id: string) {
  return coverStorage.delete(id)
}

export function isCoverStorageUnavailable() {
  return Boolean(unavailableReason)
}

export function getCoverStorageUnavailableReason() {
  return unavailableReason
}
