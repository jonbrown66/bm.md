import type { UploadOptions } from '@/storage/types'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Route as proxyRoute } from '@/routes/api.proxy.image'
import { Route as imageRoute } from '@/routes/api.upload.image'
import { Route as remoteRoute } from '@/routes/api.upload.remote-images'
import { MAX_SOURCE_IMAGE_BYTES, MAX_UPLOAD_IMAGE_BYTES, MAX_WECHAT_IMAGE_BYTES } from './image-upload-policy'
import { uploadPreparedWechatImage } from './prepare-upload-image.server'

const storage = vi.hoisted(() => ({ type: 'github' as const, upload: vi.fn(), uploadMany: vi.fn(), cacheScope: 'initial' }))
let storageScopeIndex = 0
vi.mock('@/storage', async importOriginal => ({
  ...await importOriginal<typeof import('@/storage')>(),
  getStorageProvider: () => storage,
}))

type Handler = (context: { request: Request }) => Promise<Response>
const upload = (imageRoute.options.server?.handlers as { POST: Handler }).POST
const migrate = (remoteRoute.options.server?.handlers as { POST: Handler }).POST
const proxy = (proxyRoute.options.server?.handlers as { GET: Handler }).GET

function remoteRequest(urls: string[], target = 'default') {
  return new Request('http://localhost/api/upload/remote-images', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ urls, target }),
  })
}

beforeEach(() => {
  storage.cacheScope = `test-${++storageScopeIndex}`
  storage.upload.mockReset().mockResolvedValue({ url: 'https://images.example/uploaded.png' })
  storage.uploadMany.mockReset().mockImplementation(async (images: UploadOptions[]) =>
    images.map(image => ({ url: `https://images.example/${image.filename}` })))
})
afterEach(() => vi.unstubAllGlobals())

describe('image upload routes', () => {
  it('expires successful copies so they can be regenerated after ten minutes', async () => {
    let now = 1_000_000
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now)
    const image = { file: new Blob(['prepared']), filename: 'copy.png', contentType: 'image/png' }
    try {
      await uploadPreparedWechatImage(image, storage)
      await uploadPreparedWechatImage(image, storage)
      expect(storage.upload).toHaveBeenCalledOnce()
      now += 10 * 60 * 1000 + 1
      await uploadPreparedWechatImage(image, storage)
      expect(storage.upload).toHaveBeenCalledTimes(2)
    }
    finally {
      clock.mockRestore()
    }
  })

  it('keeps identical content separate when the destination storage changes', async () => {
    const image = { file: new Blob(['prepared']), filename: 'copy.png', contentType: 'image/png' }
    storage.upload.mockResolvedValueOnce({ url: 'https://images.example/first-repo.png' })
      .mockResolvedValueOnce({ url: 'https://images.example/second-repo.png' })
    const first = await uploadPreparedWechatImage(image, storage)
    storage.cacheScope += '-second-repo'
    const second = await uploadPreparedWechatImage(image, storage)
    expect(first.url).not.toBe(second.url)
    expect(storage.upload).toHaveBeenCalledTimes(2)
  })

  it('reuses a compatible original WeChat image without writing to storage', async () => {
    const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: 'red' } }).png().toBuffer()
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } })))
    const url = 'https://example.com/original.png'
    const response = await migrate({ request: remoteRequest([url], 'wechat') })
    expect((await response.json()).results[0]).toMatchObject({ status: 'success', oldUrl: url, newUrl: url })
    expect(storage.upload).not.toHaveBeenCalled()
    expect(storage.uploadMany).not.toHaveBeenCalled()
  })

  it('reuses the uploaded compressed copy across repeated WeChat requests', async () => {
    const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: 'red' } }).png().toBuffer()
    const bytes = new Uint8Array(MAX_WECHAT_IMAGE_BYTES + 1)
    bytes.set(png)
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Response(bytes, { headers: { 'content-type': 'image/png' } })))
    const urls = ['https://example.com/large.png']
    const first = await (await migrate({ request: remoteRequest(urls, 'wechat') })).json()
    const second = await (await migrate({ request: remoteRequest(urls, 'wechat') })).json()
    expect(first.results[0].status).toBe('success')
    expect(second.results[0].newUrl).toBe(first.results[0].newUrl)
    expect(storage.upload.mock.calls.length + storage.uploadMany.mock.calls.length).toBe(1)
  })

  it('coalesces concurrent uploads of identical embedded WeChat images', async () => {
    const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: 'red' } }).png().toBuffer()
    const send = () => {
      const form = new FormData()
      form.set('name', 'diagram.png')
      form.set('file', new Blob([new Uint8Array(png)], { type: 'image/png' }))
      form.set('target', 'wechat')
      return upload({ request: new Request('http://localhost/api/upload/image', { method: 'POST', body: form }) })
    }
    const responses = await Promise.all([send(), send()])
    expect(responses.every(response => response.status === 200)).toBe(true)
    expect(storage.upload).toHaveBeenCalledTimes(1)
  })

  it('generates a new compressed copy if the same source URL changes content', async () => {
    const urls = ['https://example.com/changing.png']
    const inputs = await Promise.all(['red', 'blue'].map(async (background) => {
      const png = await sharp({ create: { width: 32, height: 32, channels: 3, background } }).png().toBuffer()
      const bytes = new Uint8Array(MAX_WECHAT_IMAGE_BYTES + 1)
      bytes.set(png)
      return bytes
    }))
    const fetchMock = vi.fn().mockImplementationOnce(() => new Response(inputs[0], { headers: { 'content-type': 'image/png' } })).mockImplementationOnce(() => new Response(inputs[1], { headers: { 'content-type': 'image/png' } }))
    vi.stubGlobal('fetch', fetchMock)
    storage.upload.mockResolvedValueOnce({ url: 'https://images.example/red.jpg' })
      .mockResolvedValueOnce({ url: 'https://images.example/blue.jpg' })
    const first = await (await migrate({ request: remoteRequest(urls, 'wechat') })).json()
    const second = await (await migrate({ request: remoteRequest(urls, 'wechat') })).json()
    expect(first.results[0].newUrl).not.toBe(second.results[0].newUrl)
    expect(storage.upload).toHaveBeenCalledTimes(2)
  })

  it('does not cache an unsuccessful embedded image upload', async () => {
    const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: 'red' } }).png().toBuffer()
    storage.upload.mockRejectedValueOnce(new Error('storage unavailable'))
      .mockResolvedValueOnce({ url: 'https://images.example/retried.png' })
    const send = () => {
      const form = new FormData()
      form.set('name', 'diagram.png')
      form.set('file', new Blob([new Uint8Array(png)], { type: 'image/png' }))
      form.set('target', 'wechat')
      return upload({ request: new Request('http://localhost/api/upload/image', { method: 'POST', body: form }) })
    }
    expect((await send()).status).toBe(500)
    const retry = await send()
    expect(retry.status).toBe(200)
    expect(await retry.json()).toEqual({ url: 'https://images.example/retried.png' })
    expect(storage.upload).toHaveBeenCalledTimes(2)
  })

  it('reports successful WeChat copies independently of another image upload failure', async () => {
    const images = await Promise.all(['red', 'blue'].map(async (background) => {
      const png = await sharp({ create: { width: 32, height: 32, channels: 3, background } }).png().toBuffer()
      const bytes = new Uint8Array(MAX_WECHAT_IMAGE_BYTES + 1)
      bytes.set(png)
      return bytes
    }))
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) =>
      new Response(url.includes('failed') ? images[0] : images[1], { headers: { 'content-type': 'image/png' } })))
    storage.upload.mockImplementation(async (options: UploadOptions) => {
      if (options.filename === 'failed.jpg') {
        throw new Error('storage unavailable')
      }
      return { url: 'https://images.example/success.jpg' }
    })
    const response = await migrate({ request: remoteRequest(['https://example.com/failed.png', 'https://example.com/success.png'], 'wechat') })
    const { results } = await response.json()
    expect(results.find((result: { oldUrl: string }) => result.oldUrl.endsWith('failed.png')).status).toBe('failed')
    expect(results.find((result: { oldUrl: string }) => result.oldUrl.endsWith('success.png')))
      .toMatchObject({ status: 'success', newUrl: 'https://images.example/success.jpg' })
  })
  it('applies the WeChat 5MB target to both local and remote uploads', async () => {
    const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: 'red' } }).png().toBuffer()
    const bytes = new Uint8Array(MAX_WECHAT_IMAGE_BYTES + 1)
    bytes.set(png)
    const form = new FormData()
    form.set('name', 'wechat.png')
    form.set('file', new Blob([bytes], { type: 'image/png' }))
    form.set('target', 'wechat')
    const response = await upload({ request: new Request('http://localhost/api/upload/image', { method: 'POST', body: form }) })
    expect(response.status).toBe(200)
    expect(storage.upload.mock.calls[0][0].file.size).toBeLessThanOrEqual(MAX_WECHAT_IMAGE_BYTES)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(bytes, { headers: { 'content-type': 'image/png' } })))
    const remote = await migrate({ request: remoteRequest(['https://example.com/wechat.png'], 'wechat') })
    expect((await remote.json()).results[0]).toMatchObject({ status: 'success' })
    // 本地与远程生成相同副本，远程请求直接复用第一次上传的链接。
    expect(storage.upload).toHaveBeenCalledOnce()
    expect(storage.upload.mock.calls[0][0].filename).toBe('wechat.jpg')
    expect(storage.uploadMany).not.toHaveBeenCalled()
  })

  it('rejects unknown compression targets before any download', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const response = await migrate({ request: remoteRequest(['https://example.com/a.png'], 'unknown') })
    expect(response.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('accepts a local image exactly at 10MB unchanged', async () => {
    const form = new FormData()
    form.set('name', 'original.png')
    form.set('file', new Blob([new Uint8Array(MAX_UPLOAD_IMAGE_BYTES)], { type: 'image/png' }))
    const response = await upload({ request: new Request('http://localhost/api/upload/image', { method: 'POST', body: form }) })
    expect(response.status).toBe(200)
    expect(storage.upload.mock.calls[0][0].file.size).toBe(MAX_UPLOAD_IMAGE_BYTES)
    expect(storage.upload.mock.calls[0][0].filename).toBe('original.png')
  })

  it('compresses oversized local and remote images with the same policy', async () => {
    const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: 'red' } }).png().toBuffer()
    const bytes = new Uint8Array(MAX_UPLOAD_IMAGE_BYTES + 1)
    bytes.set(png)
    const form = new FormData()
    form.set('name', 'large.png')
    form.set('file', new Blob([bytes], { type: 'image/png' }))
    const localResponse = await upload({ request: new Request('http://localhost/api/upload/image', { method: 'POST', body: form }) })
    expect(localResponse.status).toBe(200)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(bytes, { headers: { 'content-type': 'image/png' } })))
    const response = await migrate({ request: remoteRequest(['https://example.com/large.png']) })
    expect(response.status).toBe(200)
    const local = storage.upload.mock.calls[0][0] as UploadOptions
    const remote = storage.uploadMany.mock.calls[0][0][0] as UploadOptions
    expect(local.contentType).toBe('image/jpeg')
    expect(remote.filename).toBe('large.jpg')
    expect(await remote.file.arrayBuffer()).toEqual(await local.file.arrayBuffer())
    expect(remote.file.size).toBeLessThanOrEqual(MAX_UPLOAD_IMAGE_BYTES)
  })

  it('returns a per-image failure while uploading valid images in bounded batches', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('bad.png')) {
        return new Response(new Uint8Array(MAX_UPLOAD_IMAGE_BYTES + 1), { headers: { 'content-type': 'image/png' } })
      }
      return new Response(new Uint8Array(10), { headers: { 'content-type': 'image/png' } })
    }))
    const urls = ['https://example.com/a.png', 'https://example.com/bad.png', 'https://example.com/b.png', 'https://example.com/c.png']
    const response = await migrate({ request: remoteRequest(urls) })
    const { results } = await response.json()
    expect(results).toHaveLength(4)
    expect(results.find((result: { oldUrl: string }) => result.oldUrl === urls[1]))
      .toMatchObject({ status: 'failed', error: expect.stringContaining('暂不支持') })
    expect(storage.uploadMany.mock.calls.map(([images]) => images.length)).toEqual([1, 2])
  })

  it('rejects a remote original above 50MB before reading the body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { headers: { 'content-length': String(MAX_SOURCE_IMAGE_BYTES + 1) } })))
    const response = await migrate({ request: remoteRequest(['https://example.com/large.png']) })
    expect((await response.json()).results[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('50MB') })
    expect(storage.uploadMany).not.toHaveBeenCalled()
  })

  it('rejects oversized multipart requests before storage', async () => {
    const request = new Request('http://localhost/api/upload/image', {
      method: 'POST',
      body: 'x',
      headers: { 'content-length': String(52 * 1024 * 1024) },
    })
    expect((await upload({ request })).status).toBe(413)
    expect(storage.upload).not.toHaveBeenCalled()
  })

  it('proxies 10MB images and rejects a streamed image above that limit', async () => {
    const request = new Request('http://localhost/api/proxy/image?url=https://example.com/image.png')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(new Uint8Array(MAX_UPLOAD_IMAGE_BYTES), { headers: { 'content-type': 'image/png' } }))
      .mockResolvedValueOnce(new Response(new Uint8Array(MAX_UPLOAD_IMAGE_BYTES + 1), { headers: { 'content-type': 'image/png' } })))
    const response = await proxy({ request })
    expect(response.status).toBe(200)
    expect((await response.arrayBuffer()).byteLength).toBe(MAX_UPLOAD_IMAGE_BYTES)
    expect((await proxy({ request })).status).toBe(413)
  })
})
