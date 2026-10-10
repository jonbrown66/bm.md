import { describe, expect, it, vi } from 'vitest'
import * as uploads from '@/services/upload'
import {
  getFailedImageUrls,
  getUploadFailureDescription,
  getUploadProgressMessage,
  uploadMarkdownImages,
} from './upload-images'

describe('upload markdown images action helpers', () => {
  it('preserves edits made while an image upload is pending', async () => {
    let current = '# 旧正文\n![a](https://example.com/a.png)'
    const request = vi.spyOn(uploads, 'uploadRemoteImages').mockImplementation(async () => {
      current = '# 上传期间新增的正文\n![a](https://example.com/a.png)'
      return { results: [{ oldUrl: 'https://example.com/a.png', newUrl: 'https://images.example/a.png', status: 'success' }] }
    })
    const setContent = vi.fn((value) => {
      current = value
    })
    try {
      await uploadMarkdownImages(current, setContent, () => current)
      expect(current).toBe('# 上传期间新增的正文\n![a](https://images.example/a.png)')
    }
    finally { request.mockRestore() }
  })
  it('does not replace the content of another document after switching files', async () => {
    const request = vi.spyOn(uploads, 'uploadRemoteImages').mockResolvedValue({ results: [{ oldUrl: 'https://example.com/a.png', newUrl: 'https://images.example/a.png', status: 'success' }] })
    const setContent = vi.fn()
    try {
      await uploadMarkdownImages('![a](https://example.com/a.png)', setContent, () => undefined)
      expect(setContent).not.toHaveBeenCalled()
    }
    finally { request.mockRestore() }
  })
  it('uploads 31 images in batches without losing successful results after a request failure', async () => {
    const urls = Array.from({ length: 31 }, (_, index) => `https://example.com/${index}.png`)
    const request = vi.spyOn(uploads, 'uploadRemoteImages').mockImplementation(async (batch) => {
      if (batch.includes(urls[30])) {
        throw new Error('网络中断')
      }
      return { results: batch.map(oldUrl => ({ oldUrl, newUrl: oldUrl.replace('example.com', 'images.example'), status: 'success' as const })) }
    })
    const setContent = vi.fn()
    try {
      await uploadMarkdownImages(urls.map(url => `![image](${url})`).join('\n'), setContent)
      expect(request.mock.calls.map(([batch]) => batch.length)).toEqual([6, 6, 6, 6, 6, 1])
      expect(setContent.mock.lastCall?.[0]).toContain('https://images.example/29.png')
      expect(setContent.mock.lastCall?.[0]).toContain('https://example.com/30.png')
    }
    finally {
      request.mockRestore()
    }
  })
  it('keeps failed image links while replacing successful images', async () => {
    const request = vi.spyOn(uploads, 'uploadRemoteImages').mockResolvedValue({ results: [
      { oldUrl: 'https://example.com/a.png', newUrl: 'https://images.example/a.jpg', status: 'success' },
      { oldUrl: 'https://example.com/b.png', status: 'failed', error: '图片压缩失败' },
    ] })
    const setContent = vi.fn()
    try {
      await uploadMarkdownImages('![a](https://example.com/a.png)\n![b](https://example.com/b.png)', setContent)
      expect(setContent).toHaveBeenCalledWith('![a](https://images.example/a.jpg)\n![b](https://example.com/b.png)')
    }
    finally {
      request.mockRestore()
    }
  })
  it('summarizes failed image uploads with reason and url', () => {
    const description = getUploadFailureDescription([
      {
        oldUrl: 'https://example.com/a.png',
        newUrl: 'https://img.example.com/a.png',
        status: 'success',
      },
      {
        oldUrl: 'https://example.com/b.png',
        status: 'failed',
        error: '下载失败: 403',
      },
    ])

    expect(description).toBe('下载失败: 403: https://example.com/b.png')
  })

  it('returns no description when all image uploads succeed', () => {
    const description = getUploadFailureDescription([
      {
        oldUrl: 'https://example.com/a.png',
        newUrl: 'https://img.example.com/a.png',
        status: 'success',
      },
    ])

    expect(description).toBeUndefined()
  })

  it('extracts failed image urls for retry', () => {
    const urls = getFailedImageUrls([
      {
        oldUrl: 'https://example.com/a.png',
        newUrl: 'https://img.example.com/a.png',
        status: 'success',
      },
      {
        oldUrl: 'https://example.com/b.png',
        status: 'failed',
      },
    ])

    expect(urls).toEqual(['https://example.com/b.png'])
  })

  it('builds phase-aware upload progress messages', () => {
    expect(getUploadProgressMessage('download', 2)).toBe('正在下载 2 张图片...')
    expect(getUploadProgressMessage('commit', 2)).toBe('正在处理并上传图片，自动压缩至 5MB 以下...')
    expect(getUploadProgressMessage('retry', 1)).toBe('正在重试 1 张失败图片...')
  })
})
