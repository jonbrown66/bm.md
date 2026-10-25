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
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

function partIndex(body: FormData): number {
  return (JSON.parse(String(body.get('metadata'))) as { index: number }).index
}

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
  it('limits pending part uploads to three and commits receipts in index order after out-of-order completion', async () => {
    const pending = Array.from({ length: 5 }, () => deferred<{ receipt: string }>())
    let active = 0
    let peak = 0
    api.mockImplementation((_path: string, init: RequestInit) => {
      if (!(init.body instanceof FormData)) {
        expect(active).toBe(0)
        return Promise.resolve({ url: 'https://images.example/finished.gif' })
      }
      const index = partIndex(init.body)
      active++
      peak = Math.max(peak, active)
      return pending[index].promise.finally(() => active--)
    })
    const result = uploadImage(form(4 * UPLOAD_PART_BYTES + 10))
    expect(api).toHaveBeenCalledTimes(3)
    expect(active).toBe(3)
    pending[2].resolve({ receipt: 'receipt-2' })
    await vi.waitFor(() => expect(api).toHaveBeenCalledTimes(4))
    expect(active).toBe(3)
    pending[3].resolve({ receipt: 'receipt-3' })
    await vi.waitFor(() => expect(api).toHaveBeenCalledTimes(5))
    expect(active).toBe(3)
    pending[4].resolve({ receipt: 'receipt-4' })
    pending[1].resolve({ receipt: 'receipt-1' })
    await vi.waitFor(() => expect(active).toBe(1))
    expect(api).toHaveBeenCalledTimes(5)
    pending[0].resolve({ receipt: 'receipt-0' })
    await expect(result).resolves.toEqual({ url: 'https://images.example/finished.gif' })
    expect(peak).toBe(3)
    expect(api.mock.calls.slice(0, 5).map(([, init]) => partIndex(init.body as FormData))).toEqual([0, 1, 2, 3, 4])
    expect(JSON.parse(api.mock.lastCall![1].body).parts).toEqual(['receipt-0', 'receipt-1', 'receipt-2', 'receipt-3', 'receipt-4'])
  })
  it('retries only the failed part without committing the manifest during backoff', async () => {
    vi.useFakeTimers()
    const attempts = [0, 0, 0]
    api.mockImplementation(async (_path: string, init: RequestInit) => {
      if (!(init.body instanceof FormData)) {
        expect(attempts).toEqual([1, 2, 1])
        return { url: 'https://images.example/finished.gif' }
      }
      const index = partIndex(init.body)
      attempts[index]++
      if (index === 1 && attempts[index] === 1) {
        throw Object.assign(new Error('temporary'), { statusCode: 503 })
      }
      return { receipt: `receipt-${index}` }
    })
    const result = uploadImage(form(MAX_UPLOAD_IMAGE_BYTES + 1))
    await vi.advanceTimersByTimeAsync(499)
    expect(attempts).toEqual([1, 1, 1])
    expect(api).toHaveBeenCalledTimes(3)
    expect(api.mock.calls.every(([, init]) => init.body instanceof FormData)).toBe(true)
    await vi.runAllTimersAsync()
    await expect(result).resolves.toMatchObject({ url: expect.any(String) })
    expect(api).toHaveBeenCalledTimes(5)
    const retried = api.mock.calls.filter(([, init]) => init.body instanceof FormData && partIndex(init.body) === 1)
    expect(retried).toHaveLength(2)
    expect(retried[0][1].body).toBe(retried[1][1].body)
    expect(JSON.parse(api.mock.lastCall![1].body).parts).toEqual(['receipt-0', 'receipt-1', 'receipt-2'])
  })
  it.each(['permanent', 'exhausted', 'missing receipt'])('stops dispatching after a %s failure and handles later in-flight failures', async (mode) => {
    vi.useFakeTimers()
    const pending = Array.from({ length: 3 }, () => deferred<{ receipt: string }>())
    api.mockImplementation((_path: string, init: RequestInit) => {
      if (!(init.body instanceof FormData)) {
        throw new TypeError('manifest must not be submitted')
      }
      return pending[partIndex(init.body)].promise
    })
    const result = uploadImage(form(4 * UPLOAD_PART_BYTES + 10))
    const rejection = expect(result).rejects.toThrow(mode === 'missing receipt' ? '未返回上传凭据' : 'first failure')
    expect(api).toHaveBeenCalledTimes(3)
    if (mode === 'missing receipt') {
      pending[0].resolve({ receipt: '' })
    }
    else {
      pending[0].reject(Object.assign(new Error('first failure'), { statusCode: mode === 'exhausted' ? 503 : 413 }))
    }
    await vi.runAllTimersAsync()
    await rejection
    expect(api).toHaveBeenCalledTimes(mode === 'exhausted' ? 5 : 3)
    pending[1].resolve({ receipt: 'receipt-1' })
    pending[2].reject(Object.assign(new Error('later failure'), { statusCode: 413 }))
    await vi.runAllTimersAsync()
    expect(api.mock.calls.map(([, init]) => partIndex(init.body as FormData))).toEqual(mode === 'exhausted' ? [0, 1, 2, 0, 0] : [0, 1, 2])
  })
})
