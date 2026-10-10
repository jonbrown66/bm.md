import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_SOURCE_IMAGE_BYTES, MAX_UPLOAD_IMAGE_BYTES, UPLOAD_PART_BYTES } from '@/lib/image-upload-policy'
import { uploadImage } from './upload'

const api = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ apiFetch: api }))
beforeEach(() => {
  api.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
})
function form(size: number) {
  const data = new FormData()
  data.set('name', 'animation.gif')
  data.set('file', new Blob([new Uint8Array(size)], { type: 'image/gif' }))
  return data
}

describe('local image upload transport', () => {
  it('sends a small image directly with no part requests', async () => {
    api.mockResolvedValue({ url: 'https://images.example/small.gif' })
    await expect(uploadImage(form(MAX_UPLOAD_IMAGE_BYTES))).resolves.toMatchObject({ url: expect.any(String) })
    expect(api).toHaveBeenCalledOnce()
    expect(api.mock.calls[0][1].body).toBeInstanceOf(FormData)
  })
  it('sends a large animated image using bounded parts and a small final manifest', async () => {
    api.mockImplementation(async (_path: string, init: RequestInit) => init.body instanceof FormData
      ? { receipt: `receipt-${api.mock.calls.length}` }
      : { url: 'https://images.example/animated.gif' })
    await expect(uploadImage(form(MAX_UPLOAD_IMAGE_BYTES + 10))).resolves.toEqual({ url: 'https://images.example/animated.gif' })
    expect(api).toHaveBeenCalledTimes(4)
    const requests = api.mock.calls.slice(0, 3).map(([, init]) => init.body as FormData)
    expect(requests.map(body => (body.get('file') as Blob).size)).toEqual([UPLOAD_PART_BYTES, UPLOAD_PART_BYTES, 10])
    const metadata = requests.map(body => JSON.parse(String(body.get('metadata'))))
    expect(new Set(metadata.map(value => value.id)).size).toBe(1)
    expect(metadata.map(value => value.index)).toEqual([0, 1, 2])
    expect(JSON.parse(api.mock.lastCall![1].body)).toMatchObject({ name: 'animation.gif', contentType: 'image/gif', parts: ['receipt-1', 'receipt-2', 'receipt-3'] })
  })
  it('rejects a source above 50MiB before any network call', async () => {
    await expect(uploadImage(form(MAX_SOURCE_IMAGE_BYTES + 1))).rejects.toThrow('50MB')
    expect(api).not.toHaveBeenCalled()
  })
  it('does not retry permanent request failures', async () => {
    api.mockRejectedValue(Object.assign(new Error('too large'), { statusCode: 413 }))
    await expect(uploadImage(form(10))).rejects.toThrow('too large')
    expect(api).toHaveBeenCalledOnce()
  })
  it('retries a failed part without restarting already uploaded parts', async () => {
    vi.useFakeTimers()
    api.mockResolvedValueOnce({ receipt: 'first' })
      .mockRejectedValueOnce(Object.assign(new Error('temporary'), { statusCode: 503 }))
      .mockResolvedValueOnce({ receipt: 'second' })
      .mockResolvedValueOnce({ receipt: 'third' })
      .mockResolvedValueOnce({ url: 'https://images.example/finished.gif' })
    const result = uploadImage(form(MAX_UPLOAD_IMAGE_BYTES + 1))
    await vi.runAllTimersAsync()
    await expect(result).resolves.toMatchObject({ url: expect.any(String) })
    expect(api).toHaveBeenCalledTimes(5)
    expect(api.mock.calls[1][1].body).toBe(api.mock.calls[2][1].body)
  })
})
