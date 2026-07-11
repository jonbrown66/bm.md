export interface XhsPageSlice {
  top: number
  height: number
}

export interface XhsBlockRect {
  top: number
  height: number
}

export interface MediaFitOptions {
  availableHeight: number
  blockHeight: number
  mediaHeight: number
  tolerance: number
  minScale: number
}

export function getMediaFitScale({
  availableHeight,
  blockHeight,
  mediaHeight,
  tolerance,
  minScale,
}: MediaFitOptions): number | null {
  if (availableHeight <= 0 || blockHeight <= 0 || mediaHeight <= 0) {
    return null
  }

  if (blockHeight <= availableHeight + tolerance) {
    return 1
  }

  const nonMediaHeight = blockHeight - mediaHeight
  const targetMediaHeight = availableHeight + tolerance - nonMediaHeight
  const scale = Math.min(1, targetMediaHeight / mediaHeight)

  return scale >= minScale ? scale : null
}

export function paginateByHeight(totalHeight: number, pageHeight: number): XhsPageSlice[] {
  if (totalHeight <= 0 || pageHeight <= 0) {
    return []
  }

  const pages: XhsPageSlice[] = []
  for (let top = 0; top < totalHeight; top += pageHeight) {
    pages.push({
      top,
      height: Math.min(pageHeight, totalHeight - top),
    })
  }

  return pages
}

export function paginateBlocks(blocks: XhsBlockRect[], pageHeight: number): XhsPageSlice[] {
  if (blocks.length === 0 || pageHeight <= 0) {
    return []
  }

  const pages: XhsPageSlice[] = []
  let currentTop: number | null = null
  let currentBottom = 0

  const pushCurrentPage = () => {
    if (currentTop === null) {
      return
    }

    pages.push({
      top: currentTop,
      height: currentBottom - currentTop,
    })
    currentTop = null
    currentBottom = 0
  }

  for (const block of blocks) {
    if (block.height <= 0) {
      continue
    }

    if (block.height > pageHeight) {
      pushCurrentPage()
      pages.push(...paginateByHeight(block.height, pageHeight).map(page => ({
        top: block.top + page.top,
        height: page.height,
      })))
      continue
    }

    if (currentTop === null) {
      currentTop = block.top
      currentBottom = block.top + block.height
      continue
    }

    const nextBottom = block.top + block.height
    if (nextBottom - currentTop > pageHeight) {
      pushCurrentPage()
      currentTop = block.top
      currentBottom = nextBottom
      continue
    }

    currentBottom = nextBottom
  }

  pushCurrentPage()
  return pages
}
