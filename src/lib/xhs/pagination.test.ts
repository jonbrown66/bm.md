import { describe, expect, it } from 'vitest'
import { getMediaFitScale, paginateBlocks, paginateByHeight } from './pagination'

describe('xhs pagination', () => {
  it('returns no pages for empty height', () => {
    expect(paginateByHeight(0, 100)).toEqual([])
  })

  it('keeps exact page height in one page', () => {
    expect(paginateByHeight(100, 100)).toEqual([
      { top: 0, height: 100 },
    ])
  })

  it('splits content by page height', () => {
    expect(paginateByHeight(250, 100)).toEqual([
      { top: 0, height: 100 },
      { top: 100, height: 100 },
      { top: 200, height: 50 },
    ])
  })

  it('groups semantic blocks without splitting when possible', () => {
    expect(paginateBlocks([
      { top: 0, height: 40 },
      { top: 40, height: 50 },
      { top: 90, height: 30 },
    ], 100)).toEqual([
      { top: 0, height: 90 },
      { top: 90, height: 30 },
    ])
  })

  it('falls back to height split for oversized blocks', () => {
    expect(paginateBlocks([
      { top: 0, height: 250 },
    ], 100)).toEqual([
      { top: 0, height: 100 },
      { top: 100, height: 100 },
      { top: 200, height: 50 },
    ])
  })
})

describe('getMediaFitScale', () => {
  it('keeps the original size when the block already fits', () => {
    expect(getMediaFitScale({
      availableHeight: 500,
      blockHeight: 480,
      mediaHeight: 300,
      tolerance: 45,
      minScale: 0.85,
    })).toBe(1)
  })

  it('returns a bounded scale when a media block only slightly exceeds the page', () => {
    expect(getMediaFitScale({
      availableHeight: 500,
      blockHeight: 560,
      mediaHeight: 400,
      tolerance: 45,
      minScale: 0.85,
    })).toBeCloseTo(0.9625)
  })

  it('rejects scaling when the media would need to shrink below the limit', () => {
    expect(getMediaFitScale({
      availableHeight: 300,
      blockHeight: 560,
      mediaHeight: 400,
      tolerance: 45,
      minScale: 0.85,
    })).toBeNull()
  })

  it('uses substantial remaining space instead of moving the whole image', () => {
    expect(getMediaFitScale({
      availableHeight: 340,
      blockHeight: 400,
      mediaHeight: 360,
      tolerance: 0,
      minScale: 0.8,
    })).toBeCloseTo(5 / 6)
  })

  it('accepts the 80% boundary but rejects anything smaller', () => {
    expect(getMediaFitScale({
      availableHeight: 320,
      blockHeight: 400,
      mediaHeight: 400,
      tolerance: 0,
      minScale: 0.8,
    })).toBeCloseTo(0.8)

    expect(getMediaFitScale({
      availableHeight: 319,
      blockHeight: 400,
      mediaHeight: 400,
      tolerance: 0,
      minScale: 0.8,
    })).toBeNull()
  })
})
