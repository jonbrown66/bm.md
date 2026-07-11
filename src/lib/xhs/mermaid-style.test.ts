import { describe, expect, it } from 'vitest'
import { padMermaidViewBox } from './mermaid-style'

describe('padMermaidViewBox', () => {
  it('pads a near-landscape diagram toward 5:3', () => {
    expect(padMermaidViewBox({ x: 0, y: 0, width: 500, height: 350 })).toEqual({
      x: -41.666666666666686,
      y: 0,
      width: 583.3333333333334,
      height: 350,
    })
  })

  it('caps canvas expansion for a tall diagram', () => {
    expect(padMermaidViewBox({ x: 0, y: 0, width: 300, height: 600 })).toEqual({
      x: -37.5,
      y: 0,
      width: 375,
      height: 600,
    })
  })
})
