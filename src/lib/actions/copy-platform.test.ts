import { beforeEach, describe, expect, it, vi } from 'vitest'
import { copyPlatform } from './copy-platform'

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  copy: vi.fn(),
  toast: { loading: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('./prepare-wechat-images', () => ({ prepareWechatImages: mocks.prepare }))
vi.mock('@/lib/clipboard', () => ({ copyHtml: mocks.copy }))
vi.mock('sonner', () => ({ toast: mocks.toast }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prepare.mockResolvedValue('<img src="https://images.example/small.jpg">')
  mocks.copy.mockResolvedValue(true)
  mocks.toast.loading.mockReturnValue('copy-id')
})

describe('platform copy', () => {
  it('copies the prepared WeChat HTML rather than the original oversized image', async () => {
    const html = '<img src="https://example.com/large.png">'
    await copyPlatform('wechat', async () => html)
    expect(mocks.prepare).toHaveBeenCalledWith(html)
    expect(mocks.copy).toHaveBeenCalledWith('<img src="https://images.example/small.jpg">')
  })

  it('keeps general HTML copy unchanged', async () => {
    await copyPlatform('html', async () => '<p>original</p>')
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.copy).toHaveBeenCalledWith('<p>original</p>')
  })

  it('reports processing failures and does not copy the original image', async () => {
    mocks.prepare.mockRejectedValue(new Error('无法压缩至 5MB'))
    await copyPlatform('wechat', async () => '<img src="https://example.com/large.png">')
    expect(mocks.copy).not.toHaveBeenCalled()
    expect(mocks.toast.error).toHaveBeenCalledWith('无法压缩至 5MB', { id: 'copy-id' })
    expect(mocks.toast.success).not.toHaveBeenCalled()
  })
})
