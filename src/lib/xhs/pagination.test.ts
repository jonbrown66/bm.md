import { describe, expect, it } from 'vitest'
import { paginateBlocks, paginateByHeight } from './pagination'

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
