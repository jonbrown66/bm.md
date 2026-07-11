import type { XhsCoverDocument } from './cover-document'

const MAX_HISTORY_LENGTH = 50

export interface CoverHistory {
  past: XhsCoverDocument[]
  present: XhsCoverDocument
  future: XhsCoverDocument[]
}

export function createCoverHistory(document: XhsCoverDocument): CoverHistory {
  return { past: [], present: document, future: [] }
}

export function commitCoverHistory(history: CoverHistory, document: XhsCoverDocument): CoverHistory {
  if (history.present === document) {
    return history
  }

  return {
    past: [...history.past, history.present].slice(-MAX_HISTORY_LENGTH),
    present: document,
    future: [],
  }
}

export function undoCoverHistory(history: CoverHistory): CoverHistory {
  const previous = history.past.at(-1)
  if (!previous) {
    return history
  }

  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  }
}

export function redoCoverHistory(history: CoverHistory): CoverHistory {
  const next = history.future[0]
  if (!next) {
    return history
  }

  return {
    past: [...history.past, history.present].slice(-MAX_HISTORY_LENGTH),
    present: next,
    future: history.future.slice(1),
  }
}
