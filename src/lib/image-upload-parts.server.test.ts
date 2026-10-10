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
async function receipts() {
  const parts: string[] = []
  for (let index = 0; index < 3; index++) {
    parts.push(await stageImagePart(new Blob([bytes.slice(index * UPLOAD_PART_BYTES, (index + 1) * UPLOAD_PART_BYTES)]), { id, index, totalSize: bytes.length }, storage))
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
