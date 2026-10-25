import type { StorageProvider } from '@/storage/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assembleImageParts, stageImagePart } from './image-upload-parts.server'
import { MAX_UPLOAD_IMAGE_BYTES, UPLOAD_PART_BYTES } from './image-upload-policy'

const id = 'be063ba7-f0e3-4474-9861-91519ac3ac5e'
const bytes = new Uint8Array(MAX_UPLOAD_IMAGE_BYTES + 10)
const blobs = new Map<string, Uint8Array>()
let nextBlob = 0
const storage: StorageProvider = {
  type: 'github',
  cacheScope: 'repo-one',
  upload: vi.fn(),
  createUploadBlob: async (part) => {
    const sha = (++nextBlob).toString(16).padStart(40, '0')
    blobs.set(sha, part)
    return sha
  },
  readUploadBlob: async sha => new Uint8Array(blobs.get(sha)!).buffer,
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

async function receipts(source = bytes) {
  const parts: string[] = []
  for (let index = 0; index < Math.ceil(source.length / UPLOAD_PART_BYTES); index++) {
    parts.push(await stageImagePart(new Blob([source.slice(index * UPLOAD_PART_BYTES, (index + 1) * UPLOAD_PART_BYTES)]), { id, index, totalSize: source.length }, storage))
  }
  return parts
}
beforeEach(() => {
  vi.stubEnv('GITHUB_IMAGE_TOKEN', 'unit-test-secret')
  blobs.clear()
  nextBlob = 0
  bytes.fill(7)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('signed image upload parts', () => {
  it('assembles independent signed parts across server instances without a session cache', async () => {
    const parts = await receipts()
    const restored = await assembleImageParts(parts, { ...storage })
    expect(await restored.arrayBuffer()).toEqual(bytes.buffer)
    expect(parts.join('')).not.toContain('unit-test-secret')
    expect(storage.upload).not.toHaveBeenCalled()
  })
  it('limits pending blob reads to three and assembles by index despite out-of-order completion', async () => {
    const source = new Uint8Array(4 * UPLOAD_PART_BYTES + 10)
    for (let index = 0; index < 5; index++) {
      source.fill(index + 1, index * UPLOAD_PART_BYTES, (index + 1) * UPLOAD_PART_BYTES)
    }
    const parts = await receipts(source)
    const chunks = [...blobs.values()]
    const indices = new Map([...blobs.keys()].map((sha, index) => [sha, index]))
    const pending = Array.from({ length: 5 }, () => deferred<ArrayBuffer>())
    let active = 0
    let peak = 0
    const read = vi.fn((sha: string) => {
      active++
      peak = Math.max(peak, active)
      return pending[indices.get(sha)!].promise.finally(() => active--)
    })
    const result = assembleImageParts(parts, { ...storage, readUploadBlob: read })
    let completed = false
    void result.then(() => completed = true)
    expect(read).toHaveBeenCalledTimes(3)
    expect(active).toBe(3)
    pending[2].resolve(new Uint8Array(chunks[2]).buffer)
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(4))
    expect(active).toBe(3)
    pending[3].resolve(new Uint8Array(chunks[3]).buffer)
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(5))
    expect(active).toBe(3)
    pending[4].resolve(new Uint8Array(chunks[4]).buffer)
    pending[1].resolve(new Uint8Array(chunks[1]).buffer)
    await vi.waitFor(() => expect(active).toBe(1))
    expect(completed).toBe(false)
    pending[0].resolve(new Uint8Array(chunks[0]).buffer)
    const restored = await result
    expect(peak).toBe(3)
    expect(read.mock.calls.map(([sha]) => indices.get(sha))).toEqual([0, 1, 2, 3, 4])
    expect(await restored.arrayBuffer()).toEqual(source.buffer)
  })
  it.each(['read error', 'truncated'])('stops new reads after a %s and handles later in-flight failures', async (mode) => {
    const parts = await receipts(new Uint8Array(4 * UPLOAD_PART_BYTES + 10))
    const chunks = [...blobs.values()]
    const indices = new Map([...blobs.keys()].map((sha, index) => [sha, index]))
    const pending = Array.from({ length: 3 }, () => deferred<ArrayBuffer>())
    const read = vi.fn((sha: string) => pending[indices.get(sha)!].promise)
    const result = assembleImageParts(parts, { ...storage, readUploadBlob: read })
    const rejection = expect(result).rejects.toThrow(mode === 'truncated' ? '不完整' : 'first failure')
    expect(read).toHaveBeenCalledTimes(3)
    if (mode === 'truncated') {
      pending[0].resolve(new ArrayBuffer(1))
    }
    else {
      pending[0].reject(new Error('first failure'))
    }
    await rejection
    pending[1].resolve(new Uint8Array(chunks[1]).buffer)
    pending[2].reject(new Error('later failure'))
    await Promise.allSettled(pending.map(part => part.promise))
    expect(read).toHaveBeenCalledTimes(3)
  })
  it('rejects altered receipts before reading any private blob', async () => {
    const parts = await receipts()
    const read = vi.fn(storage.readUploadBlob)
    parts[0] = parts[0].replace(/.$/, last => last === '0' ? '1' : '0')
    await expect(assembleImageParts(parts, { ...storage, readUploadBlob: read })).rejects.toThrow('校验失败')
    expect(read).not.toHaveBeenCalled()
  })
  it('does not accept a receipt in a different destination repository', async () => {
    await expect(assembleImageParts(await receipts(), { ...storage, cacheScope: 'repo-two' })).rejects.toThrow('校验失败')
  })
  it('rejects expired receipts', async () => {
    const parts = await receipts()
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 21 * 60 * 1000)
    await expect(assembleImageParts(parts, storage)).rejects.toThrow('已过期')
  })
  it.each(['missing', 'duplicate', 'reordered', 'mixed'])('rejects %s parts before downloading', async (mode) => {
    const parts = await receipts()
    if (mode === 'missing')
      parts.pop()
    if (mode === 'duplicate')
      parts[1] = parts[0]
    if (mode === 'reordered')
      parts.reverse()
    if (mode === 'mixed')
      parts[2] = await stageImagePart(new Blob([bytes.slice(2 * UPLOAD_PART_BYTES)]), { id: 'adac9a5f-9faf-47dc-9faa-1f3b4087ce08', index: 2, totalSize: bytes.length }, storage)
    const read = vi.fn(storage.readUploadBlob)
    await expect(assembleImageParts(parts, { ...storage, readUploadBlob: read })).rejects.toMatchObject({ status: 400 })
    expect(read).not.toHaveBeenCalled()
  })
  it('rejects a part with the wrong size before storage', async () => {
    await expect(stageImagePart(new Blob(['short']), { id, index: 0, totalSize: bytes.length }, storage)).rejects.toMatchObject({ status: 400 })
    expect(blobs.size).toBe(0)
  })
  it('rejects truncated blob contents during assembly', async () => {
    const parts = await receipts()
    await expect(assembleImageParts(parts, { ...storage, readUploadBlob: async () => new ArrayBuffer(1) })).rejects.toThrow('不完整')
  })
})
