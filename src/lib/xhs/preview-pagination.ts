import { getMediaFitScale } from '@/lib/xhs/pagination'
import {
  XHS_MIN_MEDIA_FIT_SCALE,
  XHS_PAGE_HEIGHT_TOLERANCE,
  XHS_SPARSE_PAGE_HEIGHT,
  XHS_USABLE_PAGE_HEIGHT,
} from '@/lib/xhs/preview-layout'

export interface XhsRenderedPage {
  id: string
  html: string
}

function getTableHeaderHtml(table: HTMLTableElement) {
  return table.tHead?.outerHTML ?? ''
}

function createTableHtml(table: HTMLTableElement, rows: HTMLTableRowElement[]) {
  const clone = table.cloneNode(false) as HTMLTableElement
  const headerHtml = getTableHeaderHtml(table)
  const bodyHtml = `<tbody>${rows.map(row => row.outerHTML).join('')}</tbody>`
  clone.innerHTML = `${headerHtml}${bodyHtml}`

  return clone.outerHTML
}

function createArticleProbe() {
  const probe = document.createElement('div')
  probe.className = 'xhs-article xhs-measure-probe'
  probe.style.position = 'fixed'
  probe.style.top = '0'
  probe.style.left = '-9999px'
  probe.style.visibility = 'hidden'
  probe.style.pointerEvents = 'none'
  document.body.appendChild(probe)

  return probe
}

function getArticleHeight(probe: HTMLElement, html: string) {
  probe.innerHTML = `<div id="bm-md" style="background: transparent; padding: 0; margin: 0; width: 100%; min-height: auto;">${html}</div>`

  return Math.ceil(Math.max(
    probe.scrollHeight,
    probe.getBoundingClientRect().height,
  ))
}

function fitsPage(probe: HTMLElement, html: string) {
  return getArticleHeight(probe, html) <= XHS_USABLE_PAGE_HEIGHT + XHS_PAGE_HEIGHT_TOLERANCE
}

function getSingleImage(element: HTMLElement) {
  const image = element.matches('img')
    ? element as HTMLImageElement
    : element.querySelector<HTMLImageElement>('img')
  const mediaCount = element.matches('img, video, svg, canvas, iframe')
    ? 1
    : element.querySelectorAll('img, video, svg, canvas, iframe').length

  return image && mediaCount === 1 ? image : null
}

function getImageFitScale(image: HTMLImageElement) {
  const scale = Number.parseFloat(image.dataset.xhsFitScale ?? '1')
  return Number.isFinite(scale) && scale > 0 ? scale : 1
}

function fitImageBlockToAvailableHeight(
  probe: HTMLElement,
  element: HTMLElement,
  currentHtml: string,
  minScale = XHS_MIN_MEDIA_FIT_SCALE,
) {
  const currentHeight = getArticleHeight(probe, currentHtml)
  const candidateHeight = getArticleHeight(probe, `${currentHtml}${element.outerHTML}`)
  const measuredElement = probe.querySelector<HTMLElement>('#bm-md')?.lastElementChild
  if (!(measuredElement instanceof HTMLElement)) {
    return null
  }

  const image = getSingleImage(measuredElement)
  if (!image) {
    return null
  }

  const imageRect = image.getBoundingClientRect()
  if (imageRect.width <= 0 || imageRect.height <= 0) {
    return null
  }

  const blockHeight = candidateHeight - currentHeight
  if (blockHeight <= 0) {
    return null
  }

  const scale = getMediaFitScale({
    availableHeight: XHS_USABLE_PAGE_HEIGHT - currentHeight,
    blockHeight,
    mediaHeight: imageRect.height,
    tolerance: XHS_PAGE_HEIGHT_TOLERANCE,
    minScale,
  })

  if (scale === null || scale === 1) {
    return null
  }

  const fitted = element.cloneNode(true) as HTMLElement
  const fittedImage = getSingleImage(fitted)
  if (!fittedImage) {
    return null
  }

  fittedImage.style.setProperty('width', `${Math.round(imageRect.width * scale)}px`, 'important')
  fittedImage.style.setProperty('height', 'auto', 'important')
  fittedImage.style.setProperty('max-height', 'none', 'important')
  fittedImage.dataset.xhsFitScale = String(getImageFitScale(image) * scale)

  const fittedHtml = fitted.outerHTML
  return fitsPage(probe, `${currentHtml}${fittedHtml}`) ? fittedHtml : null
}

function fitLastImageBlockOnMeasuredPage(page: XhsRenderedPage, probe: HTMLElement) {
  const container = document.createElement('div')
  container.innerHTML = page.html
  const lastElement = container.lastElementChild
  if (!(lastElement instanceof HTMLElement) || !getSingleImage(lastElement)) {
    return false
  }

  lastElement.remove()
  const fittedHtml = fitImageBlockToAvailableHeight(probe, lastElement, container.innerHTML)
  if (!fittedHtml) {
    return false
  }

  page.html = normalizePageHtml(`${container.innerHTML}${fittedHtml}`)
  return true
}

function fitLeadingImageBlockToPage(
  pageHtml: string,
  next: HTMLElement,
  probe: HTMLElement,
) {
  const firstElement = next.firstElementChild
  if (!(firstElement instanceof HTMLElement)) {
    return null
  }

  if (getSingleImage(firstElement)) {
    const fittedHtml = fitImageBlockToAvailableHeight(probe, firstElement, pageHtml)
    return fittedHtml ? { fittedHtml, elements: [firstElement] } : null
  }

  const secondElement = firstElement.nextElementSibling
  if (!isHeadingTag(firstElement.tagName)
    || !(secondElement instanceof HTMLElement)
    || !getSingleImage(secondElement)) {
    return null
  }

  const headingHtml = firstElement.outerHTML
  const fittedImageHtml = fitImageBlockToAvailableHeight(
    probe,
    secondElement,
    `${pageHtml}${headingHtml}`,
  )

  return fittedImageHtml
    ? { fittedHtml: `${headingHtml}${fittedImageHtml}`, elements: [firstElement, secondElement] }
    : null
}

function mergeImageOnlyPages(pages: XhsRenderedPage[], probe: HTMLElement) {
  for (let index = 1; index < pages.length; index++) {
    const previousPage = pages[index - 1]
    const page = pages[index]
    if (!previousPage || !page) {
      continue
    }

    const container = document.createElement('div')
    container.innerHTML = normalizePageHtml(page.html)
    const onlyElement = container.children.length === 1 ? container.firstElementChild : null
    if (!(onlyElement instanceof HTMLElement)) {
      continue
    }

    const textProbe = onlyElement.cloneNode(true) as HTMLElement
    textProbe.querySelectorAll('figcaption').forEach(caption => caption.remove())
    const hasImage = onlyElement.matches('img') || Boolean(onlyElement.querySelector('img'))
    if ((textProbe.textContent ?? '').trim().length > 0 || !hasImage) {
      continue
    }

    const fittedHtml = fitImageBlockToAvailableHeight(
      probe,
      onlyElement,
      previousPage.html,
    )
    if (!fittedHtml) {
      continue
    }

    previousPage.html = normalizePageHtml(`${previousPage.html}${fittedHtml}`)
    pages.splice(index, 1)
    index -= 1
  }
}

function isHeadingTag(tagName: string) {
  return /^H[1-6]$/.test(tagName)
}

function isHeadingHtml(html: string) {
  return /^<h[1-6][\s>]/i.test(html)
}

function splitTableIntoPages(
  table: HTMLTableElement,
  probe: HTMLElement,
  firstPagePrefix = '',
): string[] {
  const rows = Array.from(table.tBodies)
    .flatMap(body => Array.from(body.rows))

  if (rows.length === 0) {
    return [table.outerHTML]
  }

  const pages: string[] = []
  let currentRows: HTMLTableRowElement[] = []
  let isFirstPage = true

  for (const row of rows) {
    const candidateRows = [...currentRows, row]
    const prefix = isFirstPage ? firstPagePrefix : ''
    const candidateHtml = `${prefix}${createTableHtml(table, candidateRows)}`

    if (currentRows.length > 0 && !fitsPage(probe, candidateHtml)) {
      pages.push(`${prefix}${createTableHtml(table, currentRows)}`)
      currentRows = []
      isFirstPage = false
    }

    currentRows.push(row)
  }

  if (currentRows.length > 0) {
    const prefix = isFirstPage ? firstPagePrefix : ''
    pages.push(`${prefix}${createTableHtml(table, currentRows)}`)
  }

  return pages
}

function rebalanceTrailingHeadings(pages: XhsRenderedPage[], probe: HTMLElement) {
  for (let index = 0; index < pages.length - 1; index++) {
    const page = pages[index]
    if (!page) {
      continue
    }

    const current = document.createElement('div')
    current.innerHTML = page.html

    const trailingHeading = current.lastElementChild
    if (!trailingHeading || !isHeadingTag(trailingHeading.tagName)) {
      continue
    }

    const headingHtml = trailingHeading.outerHTML
    trailingHeading.remove()

    if (current.innerHTML.trim().length === 0) {
      pages.splice(index, 1)
      index -= 1
    }
    else {
      page.html = current.innerHTML
    }

    const nextIndex = index + 1
    const nextPage = pages[nextIndex]
    if (!nextPage) {
      pages.push({
        id: `heading-${pages.length}`,
        html: headingHtml,
      })
      continue
    }

    const prefixedNextHtml = `${headingHtml}${nextPage.html}`
    if (fitsPage(probe, prefixedNextHtml)) {
      nextPage.html = prefixedNextHtml
      continue
    }

    const next = document.createElement('div')
    next.innerHTML = nextPage.html
    const firstNextElement = next.firstElementChild
    if (firstNextElement) {
      const pairedHtml = `${headingHtml}${firstNextElement.outerHTML}`
      firstNextElement.remove()
      nextPage.html = next.innerHTML
      pages.splice(nextIndex, 0, {
        id: `heading-${pages.length}`,
        html: pairedHtml,
      })
      continue
    }

    pages.splice(nextIndex, 0, {
      id: `heading-${pages.length}`,
      html: headingHtml,
    })
  }
}

function pairHeadingOnlyPages(pages: XhsRenderedPage[], probe: HTMLElement) {
  for (let index = 0; index < pages.length - 1; index++) {
    const page = pages[index]
    const nextPage = pages[index + 1]
    if (!page || !nextPage) {
      continue
    }

    const current = document.createElement('div')
    current.innerHTML = page.html
    const onlyChild = current.children.length === 1 ? current.firstElementChild : null
    if (!onlyChild || !isHeadingTag(onlyChild.tagName)) {
      continue
    }

    const next = document.createElement('div')
    next.innerHTML = nextPage.html
    const firstNextElement = next.firstElementChild
    if (!firstNextElement) {
      continue
    }

    const pairedHtml = `${page.html}${firstNextElement.outerHTML}`
    if (!fitsPage(probe, pairedHtml)) {
      continue
    }

    firstNextElement.remove()
    page.html = pairedHtml

    if (next.innerHTML.trim().length === 0) {
      pages.splice(index + 1, 1)
    }
    else {
      nextPage.html = next.innerHTML
    }
  }
}

function compactPages(pages: XhsRenderedPage[], probe: HTMLElement) {
  for (let index = 0; index < pages.length - 1; index++) {
    const page = pages[index]
    const nextPage = pages[index + 1]
    if (!page || !nextPage) {
      continue
    }

    const next = document.createElement('div')
    next.innerHTML = nextPage.html

    let firstNextElement = next.firstElementChild
    while (firstNextElement) {
      const secondNextElement = firstNextElement.nextElementSibling
      const moveHtml = isHeadingTag(firstNextElement.tagName) && secondNextElement
        ? `${firstNextElement.outerHTML}${secondNextElement.outerHTML}`
        : firstNextElement.outerHTML
      const candidateHtml = `${page.html}${moveHtml}`
      if (!fitsPage(probe, candidateHtml)) {
        const fitted = fitLeadingImageBlockToPage(page.html, next, probe)
        if (fitted) {
          page.html = `${page.html}${fitted.fittedHtml}`
          fitted.elements.forEach(element => element.remove())
          firstNextElement = next.firstElementChild
          continue
        }

        break
      }

      page.html = candidateHtml
      if (isHeadingTag(firstNextElement.tagName) && secondNextElement) {
        secondNextElement.remove()
      }
      firstNextElement.remove()
      firstNextElement = next.firstElementChild
    }

    if (next.innerHTML.trim().length === 0) {
      pages.splice(index + 1, 1)
      index -= 1
    }
    else {
      nextPage.html = next.innerHTML
    }
  }
}

function createCodeBlockHtml(pre: HTMLElement, lines: string[]) {
  const clone = pre.cloneNode(false) as HTMLElement
  const sourceCode = pre.querySelector('code')
  const code = sourceCode?.cloneNode(false) as HTMLElement | undefined

  if (code) {
    code.textContent = lines.join('\n')
    clone.appendChild(code)
  }
  else {
    clone.textContent = lines.join('\n')
  }

  return clone.outerHTML
}

function splitCodeBlockIntoPages(pre: HTMLElement, probe: HTMLElement) {
  const text = pre.querySelector('code')?.textContent ?? pre.textContent ?? ''
  const lines = text.replace(/\n$/, '').split('\n')
  const pages: string[] = []
  let currentLines: string[] = []

  for (const line of lines) {
    const candidateLines = [...currentLines, line]
    if (currentLines.length > 0 && !fitsPage(probe, createCodeBlockHtml(pre, candidateLines))) {
      pages.push(createCodeBlockHtml(pre, currentLines))
      currentLines = []
    }
    currentLines.push(line)
  }

  if (currentLines.length > 0) {
    pages.push(createCodeBlockHtml(pre, currentLines))
  }

  return pages
}

function hasRenderableContent(html: string) {
  const container = document.createElement('div')
  container.innerHTML = html

  if ((container.textContent ?? '').trim().length > 0) {
    return true
  }

  return Boolean(container.querySelector('img, video, svg, canvas, table, pre, hr, iframe'))
}

function isRenderableElement(element: Element) {
  if ((element.textContent ?? '').replace(/\u00A0/g, ' ').trim().length > 0) {
    return true
  }

  return Boolean(element.matches('img, video, svg, canvas, table, pre, hr, iframe')
    || element.querySelector('img, video, svg, canvas, table, pre, hr, iframe'))
}

function normalizePageHtml(html: string) {
  const container = document.createElement('div')
  container.innerHTML = html

  while (container.firstElementChild && !isRenderableElement(container.firstElementChild)) {
    container.firstElementChild.remove()
  }
  while (container.lastElementChild && !isRenderableElement(container.lastElementChild)) {
    container.lastElementChild.remove()
  }

  const firstElement = container.firstElementChild
  if (firstElement?.tagName === 'H2') {
    const firstHeading = firstElement as HTMLElement
    firstHeading.style.setProperty('margin-top', '0', 'important')
  }

  return container.innerHTML
}

function removeBlankPages(pages: XhsRenderedPage[]) {
  for (let index = pages.length - 1; index >= 0; index--) {
    if (!hasRenderableContent(pages[index]?.html ?? '')) {
      pages.splice(index, 1)
    }
  }
}

function compactSparsePages(pages: XhsRenderedPage[], probe: HTMLElement) {
  for (let index = 0; index < pages.length - 1; index++) {
    const page = pages[index]
    const nextPage = pages[index + 1]
    if (!page || !nextPage || getArticleHeight(probe, page.html) > XHS_SPARSE_PAGE_HEIGHT) {
      continue
    }

    const next = document.createElement('div')
    next.innerHTML = nextPage.html

    let firstNextElement = next.firstElementChild
    while (firstNextElement) {
      const candidateHtml = `${page.html}${firstNextElement.outerHTML}`
      if (!fitsPage(probe, candidateHtml)) {
        break
      }

      page.html = candidateHtml
      firstNextElement.remove()
      firstNextElement = next.firstElementChild
    }

    if (next.innerHTML.trim().length === 0) {
      pages.splice(index + 1, 1)
      index -= 1
    }
    else {
      nextPage.html = next.innerHTML
    }
  }
}

function normalizePageList(pages: XhsRenderedPage[], probe: HTMLElement) {
  pages.forEach((page) => {
    page.html = normalizePageHtml(page.html)
  })
  removeBlankPages(pages)
  compactSparsePages(pages, probe)
  pages.forEach((page) => {
    page.html = normalizePageHtml(page.html)
  })
  removeBlankPages(pages)
}

export function moveLastElementToNextPage(
  pages: XhsRenderedPage[],
  pageIndex: number,
) {
  const page = pages[pageIndex]
  if (!page) {
    return false
  }

  const current = document.createElement('div')
  current.innerHTML = page.html
  const lastElement = current.lastElementChild
  if (!lastElement || current.children.length <= 1) {
    return false
  }

  const movedHtml = lastElement.outerHTML
  lastElement.remove()
  page.html = current.innerHTML

  const nextPage = pages[pageIndex + 1]
  if (nextPage) {
    nextPage.html = `${movedHtml}${nextPage.html}`
  }
  else {
    pages.push({
      id: `overflow-${pages.length}`,
      html: movedHtml,
    })
  }

  removeBlankPages(pages)

  return true
}

function normalizeOverflowPages(pages: XhsRenderedPage[], probe: HTMLElement) {
  const maxIterations = pages.length * 12 + 24
  let iteration = 0

  for (let index = 0; index < pages.length; index++) {
    while (
      getArticleHeight(probe, pages[index]?.html ?? '') > XHS_USABLE_PAGE_HEIGHT + XHS_PAGE_HEIGHT_TOLERANCE
      && iteration < maxIterations
    ) {
      iteration += 1

      const page = pages[index]
      if (page && fitLastImageBlockOnMeasuredPage(page, probe)) {
        continue
      }

      if (!moveLastElementToNextPage(pages, index)) {
        break
      }
    }
  }
}

export function fitLastImageBlockOnRenderedPage(
  page: XhsRenderedPage,
  renderedPage: HTMLElement,
) {
  const article = renderedPage.querySelector<HTMLElement>('.xhs-article')
  const content = article?.querySelector<HTMLElement>('#bm-md')
  const renderedLastElement = content?.lastElementChild
  if (!article || !content || !(renderedLastElement instanceof HTMLElement)) {
    return false
  }

  const renderedImage = getSingleImage(renderedLastElement)
  if (!renderedImage) {
    return false
  }

  const articleRect = article.getBoundingClientRect()
  const contentRect = content.getBoundingClientRect()
  const imageRect = renderedImage.getBoundingClientRect()
  const safeBottom = articleRect.top + XHS_USABLE_PAGE_HEIGHT
  const boundsOverflow = contentRect.bottom - safeBottom - XHS_PAGE_HEIGHT_TOLERANCE
  const scrollOverflow = article.scrollHeight - article.clientHeight - XHS_PAGE_HEIGHT_TOLERANCE
  const overflow = Math.ceil(Math.max(boundsOverflow, scrollOverflow, 0))
  if (overflow <= 0 || imageRect.width <= 0 || imageRect.height <= overflow) {
    return false
  }

  const relativeScale = Math.min(1, (imageRect.height - overflow - 1) / imageRect.height)
  const currentScale = getImageFitScale(renderedImage)
  const nextScale = currentScale * relativeScale
  if (relativeScale >= 1 || nextScale + 0.001 < XHS_MIN_MEDIA_FIT_SCALE) {
    return false
  }

  const container = document.createElement('div')
  container.innerHTML = page.html
  const sourceLastElement = container.lastElementChild
  if (!(sourceLastElement instanceof HTMLElement)) {
    return false
  }

  const sourceImage = getSingleImage(sourceLastElement)
  if (!sourceImage) {
    return false
  }

  sourceImage.style.setProperty('width', `${Math.round(imageRect.width * relativeScale)}px`, 'important')
  sourceImage.style.setProperty('height', 'auto', 'important')
  sourceImage.style.setProperty('max-height', 'none', 'important')
  sourceImage.dataset.xhsFitScale = String(nextScale)
  page.html = normalizePageHtml(container.innerHTML)

  return true
}

export function getOverflowingExportPageIndex(container: HTMLElement) {
  const pages = Array.from(
    container.querySelectorAll<HTMLElement>('[data-xhs-export-page="true"]'),
  )

  for (let index = 0; index < pages.length; index++) {
    const article = pages[index]?.querySelector<HTMLElement>('.xhs-article')
    const lastElement = article?.lastElementChild
    if (!article || !(lastElement instanceof HTMLElement)) {
      continue
    }

    const articleRect = article.getBoundingClientRect()
    const lastRect = lastElement.getBoundingClientRect()
    const safeBottom = articleRect.top + XHS_USABLE_PAGE_HEIGHT
    const hasScrollOverflow = article.scrollHeight > article.clientHeight + XHS_PAGE_HEIGHT_TOLERANCE

    if (hasScrollOverflow || lastRect.bottom > safeBottom + XHS_PAGE_HEIGHT_TOLERANCE) {
      return index
    }
  }

  return -1
}

export function buildSemanticPages(
  measure: HTMLElement,
  mode: 'auto-height' | 'semantic-block',
): XhsRenderedPage[] {
  const blockRoot = measure.querySelector<HTMLElement>('#bm-md') ?? measure
  const elements = Array.from(blockRoot.children)
    .filter((element, index) => !(index === 0 && element.tagName === 'H1')) as HTMLElement[]
  const pages: XhsRenderedPage[] = []
  const probe = createArticleProbe()
  let currentHtml: string[] = []

  const flush = () => {
    if (currentHtml.length === 0) {
      return
    }

    pages.push({
      id: `semantic-${pages.length}`,
      html: normalizePageHtml(currentHtml.join('')),
    })
    currentHtml = []
  }

  const pushElement = (element: HTMLElement) => {
    const table = element.matches('table')
      ? element as HTMLTableElement
      : element.querySelector<HTMLTableElement>(':scope > table')
    const codeBlock = element.matches('pre') ? element : null

    const takeTrailingHeading = () => {
      const trailingHtml = currentHtml.at(-1)
      if (trailingHtml && isHeadingHtml(trailingHtml)) {
        currentHtml.pop()
        flush()

        return trailingHtml
      }

      flush()

      return null
    }

    if (table && !fitsPage(probe, table.outerHTML)) {
      const trailingHeading = takeTrailingHeading()
      const tablePages = splitTableIntoPages(table, probe, trailingHeading ?? '')

      tablePages.forEach((html, index) => {
        pages.push({
          id: `table-${pages.length}-${index}`,
          html,
        })
      })
      return
    }

    if (codeBlock && !fitsPage(probe, codeBlock.outerHTML)) {
      takeTrailingHeading()
      splitCodeBlockIntoPages(codeBlock, probe).forEach((html, index) => {
        pages.push({
          id: `code-${pages.length}-${index}`,
          html,
        })
      })
      return
    }

    const currentPageHtml = currentHtml.join('')
    const candidateHtml = `${currentPageHtml}${element.outerHTML}`
    if (currentHtml.length > 0 && !fitsPage(probe, candidateHtml)) {
      const fittedHtml = fitImageBlockToAvailableHeight(probe, element, currentPageHtml)
      if (fittedHtml) {
        currentHtml.push(fittedHtml)
        return
      }

      const trailingHeading = takeTrailingHeading()
      if (trailingHeading) {
        currentHtml = [trailingHeading]
      }
    }

    currentHtml.push(element.outerHTML)
  }

  try {
    for (let index = 0; index < elements.length; index++) {
      const element = elements[index]
      if (!element) {
        continue
      }

      if (mode === 'semantic-block' && element.tagName === 'H2' && currentHtml.length > 0) {
        flush()
      }

      pushElement(element)
    }

    flush()
    rebalanceTrailingHeadings(pages, probe)
    pairHeadingOnlyPages(pages, probe)
    if (mode === 'auto-height') {
      compactPages(pages, probe)
      rebalanceTrailingHeadings(pages, probe)
      pairHeadingOnlyPages(pages, probe)
    }
    normalizeOverflowPages(pages, probe)
    rebalanceTrailingHeadings(pages, probe)
    pairHeadingOnlyPages(pages, probe)
    normalizePageList(pages, probe)
    normalizeOverflowPages(pages, probe)
    normalizePageList(pages, probe)
    if (mode === 'semantic-block') {
      mergeImageOnlyPages(pages, probe)
      normalizePageList(pages, probe)
    }

    return pages
  }
  finally {
    probe.remove()
  }
}
