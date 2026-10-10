import { beforeEach, describe, expect, it, vi } from 'vitest'
import { copyPlatform } from './copy-platform'

const mocks = vi.hoisted(() => ({
  uploads: { uploadImage: vi.fn(), uploadRemoteImages: vi.fn() },
  copy: vi.fn(),
  toast: { loading: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/services/upload', () => mocks.uploads)
vi.mock('@/lib/clipboard', () => ({ copyHtml: mocks.copy }))
vi.mock('sonner', () => ({ toast: mocks.toast }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.copy.mockResolvedValue(true)
  mocks.toast.loading.mockReturnValue('copy-id')
})

describe('platform copy', () => {
  it('copies WeChat HTML unchanged without image processing or network requests', async () => {
    const html = '<img src="https://example.com/large.png">'
    await copyPlatform('wechat', async () => html)
    expect(mocks.uploads.uploadImage).not.toHaveBeenCalled()
    expect(mocks.uploads.uploadRemoteImages).not.toHaveBeenCalled()
    expect(mocks.copy).toHaveBeenCalledWith(html)
  })

  it('keeps general HTML copy unchanged', async () => {
    await copyPlatform('html', async () => '<p>original</p>')
    expect(mocks.uploads.uploadRemoteImages).not.toHaveBeenCalled()
    expect(mocks.copy).toHaveBeenCalledWith('<p>original</p>')
  })

  it('reports HTML generation failures without starting image processing', async () => {
    await copyPlatform('wechat', async () => {
      throw new Error('排版失败')
    })
    expect(mocks.copy).not.toHaveBeenCalled()
    expect(mocks.toast.error).toHaveBeenCalledWith('排版失败', { id: undefined })
    expect(mocks.toast.success).not.toHaveBeenCalled()
  })

  it.each([
    '<p>正文</p><img src="https://example.com/a.png" srcset="https://example.com/original.png 2x" data-src="https://example.com/a.png"><img src="https://example.com/a.png">',
    '<img src="data:image/png;base64,iVBORw0KGgo=">',
    Array.from({ length: 31 }, (_, index) => `<img src="https://example.com/${index}.png">`).join(''),
  ])('preserves repeated images, embedded diagrams and large documents when copying', async (html) => {
    await copyPlatform('wechat', async () => html)
    expect(mocks.copy).toHaveBeenCalledWith(html)
    expect(mocks.uploads.uploadImage).not.toHaveBeenCalled()
    expect(mocks.uploads.uploadRemoteImages).not.toHaveBeenCalled()
    expect(mocks.toast.loading).not.toHaveBeenCalled()
  })

  it('reports a clipboard failure without uploading fallback images', async () => {
    mocks.copy.mockResolvedValue(false)
    await copyPlatform('wechat', async () => '<p>正文</p>')
    expect(mocks.toast.error).toHaveBeenCalledWith('复制失败', { id: undefined })
    expect(mocks.uploads.uploadImage).not.toHaveBeenCalled()
  })
})
