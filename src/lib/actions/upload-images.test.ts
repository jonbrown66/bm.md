import { describe, expect, it } from 'vitest'
import {
  getFailedImageUrls,
  getUploadFailureDescription,
  getUploadProgressMessage,
} from './upload-images'

describe('upload markdown images action helpers', () => {
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
    expect(getUploadProgressMessage('commit', 2)).toBe('正在提交到 GitHub 图床...')
    expect(getUploadProgressMessage('retry', 1)).toBe('正在重试 1 张失败图片...')
  })
})
