import { describe, expect, it } from 'vitest'
import {
  detectImageContentType,
  getImageFilename,
} from './image-content'

describe('image content helpers', () => {
  it('detects png content from magic bytes', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

    expect(detectImageContentType(bytes)).toBe('image/png')
  })

  it('keeps known image filenames', () => {
    expect(getImageFilename('https://example.com/a.jpg', 'image/png')).toBe('a.jpg')
  })

  it('uses detected image extension for unknown filenames', () => {
    expect(getImageFilename('https://example.com/a.jcode', 'image/png')).toBe('image.png')
  })
})
