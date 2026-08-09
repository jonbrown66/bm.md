import type { IDBPDatabase } from 'idb'
import type { XhsCoverDocument } from './cover-document'
import { openDB } from 'idb'
import { parseCoverDocument } from './cover-document'

interface CoverRecord {
  id: string
  document: XhsCoverDocument
  updatedAt: number
}

export interface XhsSavedCoverStyle {
  id: string
  name: string
  document: XhsCoverDocument
  createdAt: number
  updatedAt: number
}

interface CoverDB {
  covers: {
    key: string
    value: CoverRecord
  }
  styles: {
    key: string
    value: XhsSavedCoverStyle
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
const savedStyleMemoryFallback = new Map<string, XhsSavedCoverStyle>()
let database: Promise<IDBPDatabase<CoverDB>> | null = null
let unavailableReason = ''

function getDatabase() {
  database ??= openDB<CoverDB>('bm.md.xhs-covers', 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('covers')) {
        db.createObjectStore('covers', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('styles')) {
        db.createObjectStore('styles', { keyPath: 'id' })
      }
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

const REUSABLE_COVER_STYLE_ID = '__bm.md.xhs.reusable-style__'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseSavedCoverStyle(value: unknown): XhsSavedCoverStyle | null {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.name !== 'string'
    || typeof value.createdAt !== 'number'
    || typeof value.updatedAt !== 'number'
    || !Number.isFinite(value.createdAt)
    || !Number.isFinite(value.updatedAt)) {
    return null
  }

  const document = parseCoverDocument(value.document)
  if (!document) {
    return null
  }

  return {
    id: value.id,
    name: value.name,
    document,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
}

function sortSavedCoverStyles(styles: XhsSavedCoverStyle[]) {
  return [...styles].sort((left, right) => right.updatedAt - left.updatedAt || right.createdAt - left.createdAt)
}

async function getPersistedCoverStyles() {
  try {
    const db = await getDatabase()
    const styles = (await db.getAll('styles'))
      .map(parseSavedCoverStyle)
      .filter((style): style is XhsSavedCoverStyle => style !== null)
    return styles.length > 0 ? styles : [...savedStyleMemoryFallback.values()]
  }
  catch {
    return [...savedStyleMemoryFallback.values()]
  }
}

async function putPersistedCoverStyle(style: XhsSavedCoverStyle) {
  savedStyleMemoryFallback.set(style.id, style)
  const db = await getDatabase()
  await db.put('styles', style)
}

async function deletePersistedCoverStyle(id: string) {
  savedStyleMemoryFallback.delete(id)
  try {
    const db = await getDatabase()
    await db.delete('styles', id)
  }
  catch {
    // 样式删除不能被浏览器存储失败阻塞。
  }
}

export function getCoverDocument(id: string) {
  return coverStorage.get(id)
}

export function saveCoverDocument(id: string, document: XhsCoverDocument) {
  return coverStorage.save(id, document)
}

export function deleteCoverDocument(id: string) {
  return coverStorage.delete(id)
}

export function getReusableCoverStyle() {
  return coverStorage.get(REUSABLE_COVER_STYLE_ID)
}

export function saveReusableCoverStyle(document: XhsCoverDocument) {
  return coverStorage.save(REUSABLE_COVER_STYLE_ID, document)
}

export function clearReusableCoverStyle() {
  return coverStorage.delete(REUSABLE_COVER_STYLE_ID)
}

export async function getSavedCoverStyles() {
  const styles = await getPersistedCoverStyles()
  const legacyStyle = await getReusableCoverStyle()
  if (legacyStyle && !styles.some(style => style.id === REUSABLE_COVER_STYLE_ID)) {
    styles.push({
      id: REUSABLE_COVER_STYLE_ID,
      name: '历史保存样式',
      document: legacyStyle,
      createdAt: 0,
      updatedAt: 0,
    })
  }
  return sortSavedCoverStyles(styles)
}

export async function getLatestSavedCoverStyle() {
  return (await getSavedCoverStyles())[0] ?? null
}

export async function saveSavedCoverStyle(name: string, document: XhsCoverDocument) {
  const timestamp = Date.now()
  const style: XhsSavedCoverStyle = {
    id: `style-${crypto.randomUUID()}`,
    name: name.trim() || '我的样式',
    document: structuredClone(document),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  await putPersistedCoverStyle(style)
  return style
}

export function deleteSavedCoverStyle(id: string) {
  return id === REUSABLE_COVER_STYLE_ID
    ? clearReusableCoverStyle()
    : deletePersistedCoverStyle(id)
}

export function isCoverStorageUnavailable() {
  return Boolean(unavailableReason)
}

export function getCoverStorageUnavailableReason() {
  return unavailableReason
}
