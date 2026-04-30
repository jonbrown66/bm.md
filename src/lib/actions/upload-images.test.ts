import { describe, expect, it } from 'vitest'
import { getUploadFailureDescription } from './upload-images'

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
})
