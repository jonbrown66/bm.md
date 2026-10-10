import { describe, expect, it, vi } from 'vitest'
import { readLimitedBody } from './image-upload-policy'

describe('bounded image download', () => {
  it('accepts the exact limit', async () => {
    expect((await readLimitedBody(new Response(new Uint8Array(10)), 10)).byteLength).toBe(10)
  })

  it('cancels a response whose declared size is too large', async () => {
    const cancel = vi.fn()
    const response = new Response(new ReadableStream({ cancel }), { headers: { 'content-length': '11' } })
    await expect(readLimitedBody(response, 10)).rejects.toMatchObject({ status: 413 })
    expect(cancel).toHaveBeenCalledOnce()
  })

  it.each([undefined, '1'])('enforces actual bytes with content-length %s', async (length) => {
    const cancel = vi.fn()
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(6))
        controller.enqueue(new Uint8Array(6))
      },
      cancel,
    })
    const response = new Response(body, { headers: length ? { 'content-length': length } : {} })
    await expect(readLimitedBody(response, 10)).rejects.toMatchObject({ status: 413 })
    expect(cancel).toHaveBeenCalledOnce()
  })
})
