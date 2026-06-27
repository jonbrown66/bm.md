import { debounce } from 'es-toolkit'
import { Download } from 'lucide-react'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { mermaidConfig } from '@/config/mermaid'
import { exportXhsImages } from '@/lib/actions'
import { getMarkdownLocaleTexts } from '@/lib/locale'
import { useEditorStore } from '@/stores/editor'
import { useFilesStore } from '@/stores/files'
import { PREVIEW_WIDTH_MOBILE, usePreviewStore } from '@/stores/preview'

const XHS_PAGE_WIDTH = 720
const XHS_PAGE_HEIGHT = 960
const XHS_PREVIEW_WIDTH = 540
const XHS_PREVIEW_SCALE = XHS_PREVIEW_WIDTH / XHS_PAGE_WIDTH
const XHS_SOURCE_WIDTH = PREVIEW_WIDTH_MOBILE
const XHS_SOURCE_SCALE = XHS_PAGE_WIDTH / XHS_SOURCE_WIDTH
const XHS_SOURCE_PAGE_HEIGHT = XHS_PAGE_HEIGHT / XHS_SOURCE_SCALE
const XHS_SOURCE_FOOTER_SAFE_AREA = 34
const XHS_USABLE_PAGE_HEIGHT = XHS_SOURCE_PAGE_HEIGHT - XHS_SOURCE_FOOTER_SAFE_AREA
const XHS_MIN_TRAILING_SPACE = 70
const XHS_SPARSE_PAGE_HEIGHT = 112
const XHS_PAGE_HEIGHT_TOLERANCE = 1
const XHS_RENDER_DEBOUNCE_MS = 250

const XHS_THEME_SURFACES: Record<string, string> = {
  botanical: '#f7f5f0',
  kiko: '#f5f4ef',
  professional: '#fafaf8',
}

function getXhsPageBackground(markdownStyle: string) {
  return XHS_THEME_SURFACES[markdownStyle] ?? XHS_THEME_SURFACES.professional
}

const XHS_ARTICLE_CSS = `
.xhs-article {
  width: ${XHS_SOURCE_WIDTH}px;
  min-height: ${XHS_SOURCE_PAGE_HEIGHT}px;
  box-sizing: border-box;
  background: transparent;
  letter-spacing: 0.03em;
  padding: 36px 28px 48px 28px;
}

.xhs-article.xhs-measure-probe {
  min-height: 0 !important;
  height: auto !important;
}

.xhs-article.xhs-page-article {
  height: ${XHS_USABLE_PAGE_HEIGHT}px !important;
  min-height: 0 !important;
  overflow: hidden !important;
}

.xhs-article *,
.xhs-article *::before,
.xhs-article *::after {
  box-sizing: border-box;
}

/* 重置 #bm-md 自身的默认样式，并进行小红书特化 */
.xhs-article #bm-md {
  width: 100% !important;
  max-width: none !important;
  min-height: auto !important;
  margin: 0 !important;
  padding: 0 !important;
  background: transparent !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif !important;
  font-size: 12.5px !important;
  line-height: 1.55 !important;
}

/* 优化段落和行内元素 */
.xhs-article #bm-md p {
  font-size: 12.5px !important;
  line-height: 1.55 !important;
  margin-top: 0 !important;
  margin-bottom: 0.8em !important;
  text-align: justify !important;
}

.xhs-article #bm-md strong {
  font-weight: 700 !important;
}

/* 优化列表排版 */
.xhs-article #bm-md ul,
.xhs-article #bm-md ol {
  padding-left: 1.5em !important;
  margin-top: 0 !important;
  margin-bottom: 0.8em !important;
}

.xhs-article #bm-md li {
  font-size: 12px !important;
  line-height: 1.5 !important;
  margin-top: 0.4em !important;
  margin-bottom: 0.4em !important;
}

/* 优化标题样式，使其大方、显眼且充满排版细节 */
.xhs-article #bm-md h1,
.xhs-article #bm-md h2,
.xhs-article #bm-md h3,
.xhs-article #bm-md h4,
.xhs-article #bm-md h5,
.xhs-article #bm-md h6 {
  font-weight: 700 !important;
  line-height: 1.3 !important;
  margin-top: 1.2em !important;
  margin-bottom: 0.6em !important;
}

.xhs-article #bm-md h1 {
  font-size: 24px !important;
}

.xhs-article #bm-md h2 {
  font-size: 20px !important;
  border-bottom: none !important;
  padding-bottom: 0 !important;
}

.xhs-article #bm-md h3 {
  font-size: 18px !important;
}

.xhs-article #bm-md h4 {
  font-size: 16px !important;
}

/* 优化引用块 */
.xhs-article #bm-md blockquote {
  margin: 0.8em 0 !important;
  padding: 8px 14px !important;
  border-left: 4px solid currentColor !important;
  background: rgba(0, 0, 0, 0.02) !important;
  border-radius: 0 6px 6px 0 !important;
}

.xhs-article #bm-md blockquote p {
  font-size: 14px !important;
  font-style: italic !important;
  margin: 0 !important;
  opacity: 0.85 !important;
}

.xhs-cover {
  display: flex;
  min-height: ${XHS_USABLE_PAGE_HEIGHT}px;
  flex-direction: column;
  justify-content: center;
  gap: 18px;
  padding: 48px 34px;
}

.xhs-cover-title {
  max-width: 100%;
  margin: 0 !important;
  font-size: 34px !important;
  font-weight: 700 !important;
  line-height: 1.16 !important;
}

.xhs-cover-subtitle {
  max-width: 100%;
  margin: 0 !important;
  font-size: 15px !important;
  line-height: 1.55 !important;
}

.xhs-page[data-markdown-style="professional"] .xhs-cover-title,
.xhs-page[data-markdown-style="professional"] .xhs-page-number {
  color: #b8860b;
}

.xhs-page[data-markdown-style="professional"] .xhs-cover-subtitle {
  color: #4a4a4a;
}

.xhs-page[data-markdown-style="botanical"] .xhs-cover-title,
.xhs-page[data-markdown-style="botanical"] .xhs-page-number {
  color: #2e5d4e;
}

.xhs-page[data-markdown-style="botanical"] .xhs-cover-subtitle {
  color: #5c5550;
}

.xhs-page[data-markdown-style="kiko"] .xhs-cover-title,
.xhs-page[data-markdown-style="kiko"] .xhs-page-number {
  color: #0751cf;
}

.xhs-page[data-markdown-style="kiko"] .xhs-cover-subtitle {
  color: #475569;
}

.xhs-page-number {
  position: absolute;
  right: 44px;
  bottom: 34px;
  font-family: "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 16px;
  line-height: 1;
  letter-spacing: 0;
}

.xhs-article > :first-child,
.xhs-article #bm-md > :first-child {
  margin-top: 0 !important;
}

.xhs-article > :last-child,
.xhs-article #bm-md > :last-child {
  margin-bottom: 0 !important;
}

.xhs-article > ul:first-child > li:first-child,
.xhs-article > ol:first-child > li:first-child,
.xhs-article #bm-md > ul:first-child > li:first-child,
.xhs-article #bm-md > ol:first-child > li:first-child {
  margin-top: 0 !important;
}

.xhs-article > ul:last-child > li:last-child,
.xhs-article > ol:last-child > li:last-child,
.xhs-article #bm-md > ul:last-child > li:last-child,
.xhs-article #bm-md > ol:last-child > li:last-child {
  margin-bottom: 0 !important;
}

.xhs-article img,
.xhs-article video,
.xhs-article svg {
  display: block !important;
  max-width: 100% !important;
  max-height: 430px !important;
  height: auto !important;
  object-fit: contain !important;
}

.xhs-article figure {
  width: 100% !important;
  break-inside: avoid !important;
}

.xhs-article figcaption {
  display: none !important;
}

.xhs-article pre {
  overflow: visible !important;
  overflow-x: visible !important;
  overflow-y: visible !important;
  white-space: pre-wrap !important;
}

.xhs-article pre > span:empty {
  display: none !important;
}

.xhs-article pre code {
  display: block !important;
  min-width: 0 !important;
  width: 100% !important;
  max-width: 100% !important;
  white-space: pre-wrap !important;
  overflow-wrap: anywhere !important;
  word-break: break-word !important;
}

.xhs-article pre code * {
  min-width: 0 !important;
  max-width: 100% !important;
  white-space: pre-wrap !important;
  overflow-wrap: anywhere !important;
  word-break: break-word !important;
}

.xhs-article table {
  width: 100% !important;
  break-inside: avoid !important;
}

.xhs-article th,
.xhs-article td {
  vertical-align: top !important;
}
`

interface XhsRenderedPage {
  id: string
  html: string
}

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null

async function loadMermaid() {
  mermaidPromise ??= import('mermaid').then((mod) => {
    mod.default.initialize(mermaidConfig)
    return mod.default
  })

  return mermaidPromise
}

async function renderMermaidNodes(container: HTMLElement) {
  const nodes = Array.from(
    container.querySelectorAll('.mermaid:not([data-processed="true"])'),
  ) as HTMLElement[]

  if (nodes.length === 0) {
    return
  }

  const mermaid = await loadMermaid()

  await Promise.all(nodes.map(async (node, index) => {
    try {
      const id = `xhs-mermaid-${Date.now()}-${index}`
      const text = node.textContent || ''
      const { svg } = await mermaid.render(id, text)
      node.innerHTML = svg
      node.setAttribute('data-processed', 'true')
    }
    catch (error) {
      console.error('Mermaid render error:', error)
      node.innerHTML = `<p class="text-red-500 font-mono text-sm p-2 bg-red-50 rounded">${error instanceof Error ? error.message : String(error)}</p>`
    }
  }))
}

function XhsPage({
  html,
  markdownStyle,
  pageNumber,
  pageCount,
  exportPage = false,
}: {
  html: string
  markdownStyle: string
  pageNumber?: number
  pageCount?: number
  exportPage?: boolean
}) {
  const pageBackground = getXhsPageBackground(markdownStyle)

  return (
    <div
      data-xhs-export-page={exportPage ? 'true' : undefined}
      data-markdown-style={markdownStyle}
      className="xhs-page relative overflow-hidden text-black shadow-sm"
      style={{
        width: XHS_PAGE_WIDTH,
        height: XHS_PAGE_HEIGHT,
        background: pageBackground,
      }}
    >
      <div
        className="absolute top-0 left-0"
        style={{
          width: XHS_SOURCE_WIDTH,
          height: XHS_SOURCE_PAGE_HEIGHT,
          transform: `scale(${XHS_SOURCE_SCALE})`,
          transformOrigin: 'top left',
        }}
      >
        <div
          className={pageNumber ? 'xhs-article xhs-page-article' : 'xhs-article'}
        >
          {pageNumber
            ? (
                <div
                  id="bm-md"
                  style={{ background: 'transparent', padding: 0, margin: 0, width: '100%', minHeight: 'auto' }}
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              )
            : (
                <div dangerouslySetInnerHTML={{ __html: html }} />
              )}
        </div>
      </div>
      {pageNumber && pageCount && (
        <div className="xhs-page-number">
          {String(pageNumber).padStart(2, '0')}
          {' / '}
          {String(pageCount).padStart(2, '0')}
        </div>
      )}
    </div>
  )
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

function isHeadingTag(tagName: string) {
  return /^H[1-6]$/.test(tagName)
}

function isHeadingHtml(html: string) {
  return /^<h[1-6][\s>]/i.test(html)
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;')
}

function getCleanText(element: Element | null | undefined) {
  return element?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

function truncateText(text: string, maxLength: number) {
  if (text.length <= maxLength) {
    return text
  }

  return `${text.slice(0, maxLength).replace(/[，。；、,. ;:：]+$/u, '')}...`
}

function createCoverHtml(blockRoot: HTMLElement) {
  const title = getCleanText(blockRoot.querySelector('h1'))
    || getCleanText(blockRoot.querySelector('h2'))
    || '未命名文章'
  const subtitle = truncateText(Array.from(blockRoot.querySelectorAll('p'))
    .map(getCleanText)
    .find(text => text.length >= 12 && !text.startsWith('[!'))
    ?? '', 34)

  return `
    <section class="xhs-cover">
      <h1 class="xhs-cover-title">${escapeHtml(truncateText(title, 28))}</h1>
      ${subtitle ? `<p class="xhs-cover-subtitle">${escapeHtml(subtitle)}</p>` : ''}
    </section>
  `
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

function hasRenderableContent(html: string) {
  const container = document.createElement('div')
  container.innerHTML = html

  if ((container.textContent ?? '').trim().length > 0) {
    return true
  }

  return Boolean(container.querySelector('img, video, svg, canvas, table, pre, hr, iframe'))
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
  removeBlankPages(pages)
  compactSparsePages(pages, probe)
  removeBlankPages(pages)
}

function moveLastElementToNextPage(
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

      if (!moveLastElementToNextPage(pages, index)) {
        break
      }
    }
  }
}

function getOverflowingExportPageIndex(container: HTMLElement) {
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

function buildSemanticPages(
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
      html: currentHtml.join(''),
    })
    currentHtml = []
  }

  const pushElement = (element: HTMLElement) => {
    const table = element.matches('table')
      ? element as HTMLTableElement
      : element.querySelector<HTMLTableElement>(':scope > table')

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

    const candidateHtml = [...currentHtml, element.outerHTML].join('')
    if (currentHtml.length > 0 && !fitsPage(probe, candidateHtml)) {
      const trailingHeading = takeTrailingHeading()
      if (trailingHeading) {
        currentHtml = [trailingHeading]
      }
    }

    if (
      currentHtml.length > 0
      && getArticleHeight(probe, element.outerHTML) < XHS_MIN_TRAILING_SPACE
      && XHS_USABLE_PAGE_HEIGHT - getArticleHeight(probe, currentHtml.join('')) < XHS_MIN_TRAILING_SPACE
    ) {
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

      const isHeading = isHeadingTag(element.tagName)
      if (mode === 'semantic-block' && element.tagName === 'H2' && currentHtml.length > 0) {
        flush()
      }

      const nextElement = elements[index + 1]
      if (isHeading && nextElement) {
        const pairHtml = [...currentHtml, element.outerHTML, nextElement.outerHTML].join('')

        if (currentHtml.length > 0 && !fitsPage(probe, pairHtml)) {
          flush()
        }
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

    pages.unshift({
      id: 'cover',
      html: createCoverHtml(blockRoot),
    })

    return pages
  }
  finally {
    probe.remove()
  }
}

async function waitForImages(container: HTMLElement) {
  const images = Array.from(container.querySelectorAll('img'))
  await Promise.all(images.map(image => new Promise<void>((resolve) => {
    if (image.complete) {
      resolve()
      return
    }

    image.addEventListener('load', () => resolve(), { once: true })
    image.addEventListener('error', () => resolve(), { once: true })
  })))
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result)))
    reader.addEventListener('error', () => reject(reader.error))
    reader.readAsDataURL(blob)
  })
}

async function inlineRemoteImages(container: HTMLElement) {
  const images = Array.from(container.querySelectorAll('img'))

  await Promise.all(images.map(async (image) => {
    const source = image.currentSrc || image.src
    if (!source || source.startsWith('data:') || source.startsWith('blob:')) {
      return
    }

    let url: URL
    try {
      url = new URL(source, window.location.href)
    }
    catch {
      return
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
      return
    }

    try {
      const response = await fetch(url.href)
      if (!response.ok) {
        return
      }

      image.src = await blobToDataUrl(await response.blob())
      image.removeAttribute('srcset')
      image.removeAttribute('sizes')
    }
    catch (error) {
      console.warn('Inline XHS image failed:', source, error)
    }
  }))
}

export function XhsPreview() {
  const content = useFilesStore(state => state.currentContent)
  const deferredContent = useDeferredValue(content)
  const enableFootnoteLinks = useEditorStore(state => state.enableFootnoteLinks)
  const openLinksInNewWindow = useEditorStore(state => state.openLinksInNewWindow)
  const markdownStyle = usePreviewStore(state => state.markdownStyle)
  const codeTheme = usePreviewStore(state => state.codeTheme)
  const customCss = usePreviewStore(state => state.customCss)
  const renderedHtml = usePreviewStore(state => state.getRenderedHtml('html'))
  const setRenderedHtml = usePreviewStore(state => state.setRenderedHtml)
  const xhsPaginationMode = usePreviewStore(state => state.xhsPaginationMode)
  const setXhsPaginationMode = usePreviewStore(state => state.setXhsPaginationMode)

  const measureRef = useRef<HTMLDivElement>(null)
  const exportPagesRef = useRef<HTMLDivElement>(null)
  const overflowFixCountRef = useRef(0)
  const renderSeqRef = useRef(0)
  const [renderedPages, setRenderedPages] = useState<XhsRenderedPage[]>([])
  const [isRendering, setIsRendering] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const scheduleRender = useMemo(
    () => debounce(async (
      seq: number,
      nextContent: string,
      styleId: string,
      themeId: string,
      customCssValue: string,
      enableRefLinks: boolean,
      openNewWin: boolean,
    ) => {
      setIsRendering(true)
      try {
        const { markdown } = await import('@/lib/markdown/browser')
        const result = await markdown.render({
          markdown: nextContent,
          markdownStyle: styleId,
          codeTheme: themeId,
          customCss: customCssValue,
          enableFootnoteLinks: enableRefLinks,
          openLinksInNewWindow: openNewWin,
          ...getMarkdownLocaleTexts(),
        })

        if (seq === renderSeqRef.current) {
          setRenderedHtml('html', result.result)
        }
      }
      catch (error) {
        if (seq === renderSeqRef.current) {
          const message = error instanceof Error ? error.message : '转换失败'
          setRenderedHtml('html', message)
        }
      }
      finally {
        if (seq === renderSeqRef.current) {
          setIsRendering(false)
        }
      }
    }, XHS_RENDER_DEBOUNCE_MS),
    [setRenderedHtml],
  )

  useEffect(() => {
    const seq = renderSeqRef.current + 1
    renderSeqRef.current = seq
    scheduleRender(seq, deferredContent, markdownStyle, codeTheme, customCss, enableFootnoteLinks, openLinksInNewWindow)

    return () => {
      scheduleRender.cancel()
    }
  }, [deferredContent, markdownStyle, codeTheme, customCss, enableFootnoteLinks, openLinksInNewWindow, scheduleRender])

  const calculatePages = useCallback(async () => {
    const measure = measureRef.current
    if (!measure || !renderedHtml) {
      setRenderedPages([])
      return
    }

    await renderMermaidNodes(measure)
    await inlineRemoteImages(measure)
    await waitForImages(measure)
    await document.fonts.ready
    setRenderedPages(buildSemanticPages(measure, xhsPaginationMode))
  }, [renderedHtml, xhsPaginationMode])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void calculatePages()
    })

    return () => window.cancelAnimationFrame(frame)
  }, [calculatePages])

  useEffect(() => {
    overflowFixCountRef.current = 0
  }, [renderedHtml, xhsPaginationMode])

  useEffect(() => {
    if (renderedPages.length === 0) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      const exportPages = exportPagesRef.current
      if (!exportPages) {
        return
      }

      const overflowIndex = getOverflowingExportPageIndex(exportPages)
      if (overflowIndex < 0) {
        return
      }

      if (overflowFixCountRef.current > renderedPages.length * 8 + 24) {
        console.warn('XHS pagination overflow could not be fully resolved')
        return
      }

      setRenderedPages((previousPages) => {
        const nextPages = previousPages.map(page => ({ ...page }))
        const moved = moveLastElementToNextPage(nextPages, overflowIndex)
        if (!moved) {
          return previousPages
        }

        overflowFixCountRef.current += 1
        return nextPages
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [renderedPages])

  const pageCountText = useMemo(() => {
    if (isRendering) {
      return '渲染中'
    }

    return `共 ${renderedPages.length} 张`
  }, [isRendering, renderedPages.length])

  const handleExport = async () => {
    setIsExporting(true)
    try {
      await exportXhsImages()
    }
    finally {
      setIsExporting(false)
    }
  }

  const hasContent = renderedHtml.trim().length > 0

  return (
    <div className="flex size-full flex-col overflow-hidden">
      <style>
        {XHS_ARTICLE_CSS}
      </style>
      <div className={`
        flex shrink-0 items-center justify-between gap-3 border-b bg-background
        px-4 py-3
      `}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex overflow-hidden rounded-md border">
            <Button
              type="button"
              variant={xhsPaginationMode === 'auto-height' ? 'secondary' : 'ghost'}
              size="sm"
              className="rounded-none"
              onClick={() => setXhsPaginationMode('auto-height')}
            >
              自动高度
            </Button>
            <Button
              type="button"
              variant={xhsPaginationMode === 'semantic-block' ? 'secondary' : 'ghost'}
              size="sm"
              className="rounded-none border-l"
              onClick={() => setXhsPaginationMode('semantic-block')}
            >
              结构分页
            </Button>
          </div>
          <span className="shrink-0 text-sm text-muted-foreground">
            {pageCountText}
          </span>
        </div>
        <Button
          size="sm"
          disabled={!hasContent || renderedPages.length === 0 || isRendering || isExporting}
          onClick={handleExport}
        >
          <Download className="size-4" />
          {isExporting ? '导出中' : '导出小红书图片'}
        </Button>
      </div>

      <div className="relative flex-1 overflow-auto bg-editor px-6 py-8">
        <div
          ref={measureRef}
          className={`
            xhs-article pointer-events-none fixed top-0 left-[-9999px]
          `}
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />

        <div
          className={`
            pointer-events-none fixed top-0 left-[-9999px] flex flex-col gap-6
          `}
          ref={exportPagesRef}
        >
          {renderedPages.map((page, index) => (
            <XhsPage
              key={`export-${page.id}`}
              html={page.html}
              markdownStyle={markdownStyle}
              pageNumber={page.id === 'cover' ? undefined : index + 1}
              pageCount={page.id === 'cover' ? undefined : renderedPages.length}
              exportPage
            />
          ))}
        </div>

        {!hasContent && (
          <div className={`
            flex h-full items-center justify-center text-sm
            text-muted-foreground
          `}
          >
            没有可预览的内容
          </div>
        )}

        {hasContent && (
          <div className="mx-auto flex w-fit flex-col items-center gap-10">
            {renderedPages.map((page, index) => (
              <div
                key={`preview-${page.id}`}
                className="flex w-fit flex-col items-center gap-3"
              >
                <div className="text-center text-xs text-muted-foreground">
                  {index + 1}
                  {' '}
                  /
                  {renderedPages.length}
                </div>
                <div
                  className="origin-top overflow-hidden rounded-md border"
                  style={{
                    width: XHS_PREVIEW_WIDTH,
                    height: XHS_PAGE_HEIGHT * XHS_PREVIEW_SCALE,
                    background: getXhsPageBackground(markdownStyle),
                  }}
                >
                  <div
                    style={{
                      width: XHS_PAGE_WIDTH,
                      height: XHS_PAGE_HEIGHT,
                      transform: `scale(${XHS_PREVIEW_SCALE})`,
                      transformOrigin: 'top left',
                    }}
                  >
                    <XhsPage
                      html={page.html}
                      markdownStyle={markdownStyle}
                      pageNumber={page.id === 'cover' ? undefined : index + 1}
                      pageCount={page.id === 'cover' ? undefined : renderedPages.length}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
