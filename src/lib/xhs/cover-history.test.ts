import { describe, expect, it } from 'vitest'
import { createDefaultCoverDocument } from './cover-document'
import { commitCoverHistory, createCoverHistory, redoCoverHistory, undoCoverHistory } from './cover-history'

describe('xhs cover history', () => {
  it('undoes and redoes committed documents', () => {
    const first = createDefaultCoverDocument('# First')
    const second = { ...first, elements: [] }
    const committed = commitCoverHistory(createCoverHistory(first), second)

    expect(undoCoverHistory(committed).present).toEqual(first)
    expect(redoCoverHistory(undoCoverHistory(committed)).present).toEqual(second)
  })

  it('clears redo entries after a new commit', () => {
    const first = createDefaultCoverDocument('# First')
    const second = { ...first, elements: [] }
    const undone = undoCoverHistory(commitCoverHistory(createCoverHistory(first), second))
    const third = createDefaultCoverDocument('# Third')

    expect(commitCoverHistory(undone, third).future).toEqual([])
  })
})
