import { describe, expect, it } from 'vitest'
import {
  extractRemoteImageReferences,
  replaceImageUrls,
} from './images'

describe('markdown image migration helpers', () => {
  it('extracts unique remote markdown and html image urls', () => {
    const markdown = [
      '![封面](https://example.com/cover.png)',
      '<img src="https://cdn.example.com/a.jpg" alt="a">',
      '![重复](https://example.com/cover.png)',
    ].join('\n')

    expect(extractRemoteImageReferences(markdown)).toEqual([
      'https://example.com/cover.png',
      'https://cdn.example.com/a.jpg',
    ])
  })

  it('ignores local, data, and non-http images', () => {
    const markdown = [
      '![本地](./cover.png)',
      '![数据](data:image/png;base64,abc)',
      '![协议](ftp://example.com/a.png)',
      '<img src="/images/a.png">',
    ].join('\n')

    expect(extractRemoteImageReferences(markdown)).toEqual([])
  })

  it('replaces only successful image urls', () => {
    const markdown = [
      '![封面](https://example.com/cover.png)',
      '<img src="https://cdn.example.com/a.jpg">',
      '![失败](https://example.com/fail.png)',
    ].join('\n')

    const result = replaceImageUrls(markdown, [
      {
        oldUrl: 'https://example.com/cover.png',
        newUrl: 'https://img.example.com/cover.png',
      },
      {
        oldUrl: 'https://cdn.example.com/a.jpg',
        newUrl: 'https://img.example.com/a.jpg',
      },
    ])

    expect(result).toContain('![封面](https://img.example.com/cover.png)')
    expect(result).toContain('<img src="https://img.example.com/a.jpg">')
    expect(result).toContain('![失败](https://example.com/fail.png)')
  })
})
