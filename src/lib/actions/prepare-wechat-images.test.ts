// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareWechatImages } from './prepare-wechat-images'

const uploads = vi.hoisted(() => ({ uploadRemoteImages: vi.fn(), uploadImage: vi.fn() }))
vi.mock('@/services/upload', () => uploads)

beforeEach(() => {
  uploads.uploadRemoteImages.mockReset().mockImplementation(async (urls: string[]) => ({
    results: urls.map((oldUrl, index) => ({ oldUrl, newUrl: `https://images.example/${index}.jpg`, status: 'success' })),
  }))
  uploads.uploadImage.mockReset().mockResolvedValue({ url: 'https://images.example/diagram.png' })
})
afterEach(() => vi.unstubAllGlobals())

describe('weChat copy image preparation', () => {
  it('deduplicates images and replaces only copy HTML with compatible URLs', async () => {
    const html = '<p>正文</p><img src="https://example.com/large.png" srcset="https://example.com/original.png 2x" sizes="100vw" data-src="https://example.com/large.png"><img src="https://example.com/large.png">'
    const output = await prepareWechatImages(html)
    expect(uploads.uploadRemoteImages).toHaveBeenCalledOnce()
    expect(uploads.uploadRemoteImages).toHaveBeenCalledWith(['https://example.com/large.png'], 'wechat')
    const doc = new DOMParser().parseFromString(output, 'text/html')
    expect(Array.from(doc.querySelectorAll('img')).map(image => image.src)).toEqual(['https://images.example/0.jpg', 'https://images.example/0.jpg'])
    expect(doc.querySelector('img')?.getAttribute('srcset')).toBeNull()
    expect(doc.querySelector('img')?.getAttribute('data-src')).toBe('https://images.example/0.jpg')
    expect(html).toContain('https://example.com/large.png')
    expect(output).toContain('<p>正文</p>')
  })

  it('blocks copy rather than carrying an oversized failed image into WeChat', async () => {
    uploads.uploadRemoteImages.mockResolvedValue({ results: [{ oldUrl: 'https://example.com/large.png', status: 'failed', error: '无法压缩至 5MB' }] })
    await expect(prepareWechatImages('<img src="https://example.com/large.png">')).rejects.toThrow('无法压缩至 5MB')
  })

  it('uploads embedded diagrams with the WeChat target', async () => {
    const source = 'data:image/png;base64,iVBORw0KGgo='
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['image'], { type: 'image/png' }) }))
    const output = await prepareWechatImages(`<img src="${source}">`)
    const form = uploads.uploadImage.mock.calls[0][0] as FormData
    expect(form.get('target')).toBe('wechat')
    expect(output).toContain('https://images.example/diagram.png')
    expect(output).not.toContain('data:')
  })

  it('splits documents above the API image count limit into batches', async () => {
    const html = Array.from({ length: 31 }, (_, index) => `<img src="https://example.com/${index}.png">`).join('')
    await prepareWechatImages(html)
    expect(uploads.uploadRemoteImages.mock.calls.map(([urls]) => urls.length)).toEqual([30, 1])
  })
})
