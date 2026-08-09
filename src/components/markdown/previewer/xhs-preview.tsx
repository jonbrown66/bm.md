import type { XhsCoverDocument } from '@/lib/xhs/cover-document'
import type { XhsRenderedPage } from '@/lib/xhs/preview-pagination'
import { Slider as SliderPrimitive } from '@base-ui/react/slider'
import { debounce } from 'es-toolkit'
import { Download, Pencil, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { exportXhsImage, exportXhsImages } from '@/lib/actions'
import { getMarkdownLocaleTexts } from '@/lib/locale'
import { createDefaultCoverDocument } from '@/lib/xhs/cover-document'
import { getCoverDocument, getLatestSavedCoverStyle } from '@/lib/xhs/cover-storage'
import { formatXhsContentPageFooter } from '@/lib/xhs/footer'
import {
  cleanInlineStyles,
  inlineRemoteImages,
  renderMermaidNodes,
  waitForImages,
} from '@/lib/xhs/preview-content'
import {
  XHS_PAGE_HEIGHT,
  XHS_PAGE_WIDTH,
  XHS_PREVIEW_SCALE,
  XHS_PREVIEW_WIDTH,
} from '@/lib/xhs/preview-layout'
import {
  buildSemanticPages,
  fitLastImageBlockOnRenderedPage,
  getOverflowingExportPageIndex,
  moveLastElementToNextPage,

} from '@/lib/xhs/preview-pagination'
import { getXhsArticleCss, getXhsPageBackground } from '@/lib/xhs/preview-style'

import { getXhsFontOption, XHS_FONT_OPTIONS } from '@/lib/xhs/typography'
import { useEditorStore } from '@/stores/editor'
import { useFilesStore } from '@/stores/files'
import { usePreviewStore } from '@/stores/preview'
import { XhsCoverEditor } from './xhs-cover-editor'
import { XhsPage } from './xhs-page'

const XHS_RENDER_DEBOUNCE_MS = 250
const XHS_AUTHOR_PRESETS = ['AI首席情报员-阿布', '开源小聪明'] as const

function XhsSlider({
  value,
  onValueCommit,
  min,
  max,
  step,
  ariaLabel,
}: {
  value: number
  onValueCommit: (value: number) => void
  min: number
  max: number
  step: number
  ariaLabel: string
}) {
  const [draftValue, setDraftValue] = useState(value)

  const handleValueCommitted = useCallback((nextValue: number) => {
    setDraftValue(nextValue)
    onValueCommit(nextValue)
  }, [onValueCommit])

  return (
    <SliderPrimitive.Root
      value={draftValue}
      onValueChange={setDraftValue}
      onValueCommitted={handleValueCommitted}
      min={min}
      max={max}
      step={step}
      thumbAlignment="edge"
      className="w-full"
    >
      <SliderPrimitive.Control className={`
        relative flex w-full touch-none items-center select-none
      `}
      >
        <SliderPrimitive.Track className={`
          relative h-1 w-full overflow-hidden bg-muted select-none
        `}
        >
          <SliderPrimitive.Indicator className="h-full bg-primary select-none" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          getAriaLabel={() => ariaLabel}
          className={`
            relative block size-3 shrink-0 rounded-none border border-ring
            bg-white ring-ring/50 select-none
            after:absolute after:-inset-2
            hover:ring-1
            focus-visible:ring-1 focus-visible:outline-hidden
            active:ring-1
          `}
        />
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export function XhsPreview() {
  const content = useFilesStore(state => state.currentContent)
  const activeFileId = useFilesStore(state => state.activeFileId)
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
  const xhsFontSize = usePreviewStore(state => state.xhsFontSize)
  const setXhsFontSize = usePreviewStore(state => state.setXhsFontSize)
  const xhsLineHeight = usePreviewStore(state => state.xhsLineHeight)
  const setXhsLineHeight = usePreviewStore(state => state.setXhsLineHeight)
  const xhsPadding = usePreviewStore(state => state.xhsPadding)
  const setXhsPadding = usePreviewStore(state => state.setXhsPadding)
  const xhsFontFamily = usePreviewStore(state => state.xhsFontFamily)
  const setXhsFontFamily = usePreviewStore(state => state.setXhsFontFamily)
  const xhsAuthorName = usePreviewStore(state => state.xhsAuthorName)
  const setXhsAuthorName = usePreviewStore(state => state.setXhsAuthorName)
  const xhsShowFooter = usePreviewStore(state => state.xhsShowFooter)
  const setXhsShowFooter = usePreviewStore(state => state.setXhsShowFooter)

  const measureRef = useRef<HTMLDivElement>(null)
  const exportPagesRef = useRef<HTMLDivElement>(null)
  const overflowFixCountRef = useRef(0)
  const renderSeqRef = useRef(0)
  const prepareSeqRef = useRef(0)
  const paginationSeqRef = useRef(0)
  const [renderedPages, setRenderedPages] = useState<XhsRenderedPage[]>([])
  const [isRendering, setIsRendering] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportingPageIndex, setExportingPageIndex] = useState<number | null>(null)
  const [preparedHtml, setPreparedHtml] = useState('')
  const [isPreparing, setIsPreparing] = useState(false)
  const [coverDocument, setCoverDocument] = useState<XhsCoverDocument>(() => createDefaultCoverDocument(content))
  const [coverEditorOpen, setCoverEditorOpen] = useState(false)
  const [hasCustomCover, setHasCustomCover] = useState(false)
  const [coverStyleId, setCoverStyleId] = useState<string | null>(null)

  useEffect(() => {
    if (!activeFileId) {
      setCoverDocument(createDefaultCoverDocument(''))
      setHasCustomCover(false)
      setCoverStyleId(null)
      return
    }

    let active = true
    const load = async () => {
      const stored = await getCoverDocument(activeFileId)
      const savedStyle = stored ? null : await getLatestSavedCoverStyle()
      if (active) {
        if (stored) {
          setCoverDocument(stored)
          setHasCustomCover(true)
          setCoverStyleId(null)
        }
        else if (savedStyle) {
          setCoverDocument(savedStyle.document)
          setHasCustomCover(true)
          setCoverStyleId(savedStyle.id)
        }
        else {
          setCoverDocument(createDefaultCoverDocument(content))
          setHasCustomCover(false)
          setCoverStyleId(null)
        }
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [activeFileId])

  useEffect(() => {
    if (!hasCustomCover) {
      setCoverDocument(createDefaultCoverDocument(content))
    }
  }, [content, hasCustomCover])

  const handleCoverSaved = (doc: XhsCoverDocument) => {
    setCoverDocument(doc)
    setHasCustomCover(true)
    setCoverStyleId(null)
  }

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

  useEffect(() => {
    const seq = prepareSeqRef.current + 1
    prepareSeqRef.current = seq
    const abortController = new AbortController()
    if (!renderedHtml) {
      setPreparedHtml('')
      setIsPreparing(false)
      return
    }

    const prepare = async () => {
      setIsPreparing(true)
      try {
        const temp = document.createElement('div')
        temp.innerHTML = cleanInlineStyles(renderedHtml)

        await renderMermaidNodes(temp)
        if (seq !== prepareSeqRef.current) {
          return
        }

        await inlineRemoteImages(temp, abortController.signal)
        if (seq !== prepareSeqRef.current) {
          return
        }

        await waitForImages(temp)

        // 此时所有的 img 元素已经彻底加载完毕，naturalWidth 和 naturalHeight 均已就绪。
        // 我们直接根据小红书的排版宽度（720px - padding）和图片最大尺寸限制（600x360），
        // 利用等比缩放公式，像素级精确算出图片渲染高度，直接写死在 style 属性中！
        // 这样可以彻底规避 DOM 异步解码和测量重排导致的 0 高度 Bug。
        const state = usePreviewStore.getState()
        const currentPadding = state.xhsPadding || 20
        const scaledPadding = currentPadding * (720 / 375)
        const maxAvailableWidth = 720 - 2 * scaledPadding
        const maxWidth = Math.min(maxAvailableWidth, 600)
        const maxHeight = 360

        const images = Array.from(temp.querySelectorAll('img'))
        images.forEach((img) => {
          const nw = img.naturalWidth || 800
          const nh = img.naturalHeight || 600

          let targetWidth = maxWidth
          let targetHeight = (nh / nw) * targetWidth

          if (targetHeight > maxHeight) {
            targetHeight = maxHeight
            targetWidth = (nw / nh) * targetHeight
          }
          if (targetWidth > maxWidth) {
            targetWidth = maxWidth
            targetHeight = (nh / nw) * targetWidth
          }

          const originalStyle = img.getAttribute('style') || ''
          const cleanedStyle = originalStyle
            .replace(/width\s*:[^;"]+;?/gi, '')
            .replace(/height\s*:[^;"]+;?/gi, '')

          img.setAttribute(
            'style',
            `${cleanedStyle}${cleanedStyle && !cleanedStyle.endsWith(';') ? ';' : ''} width: ${Math.round(targetWidth)}px !important; height: ${Math.round(targetHeight)}px !important;`,
          )
        })

        if (seq === prepareSeqRef.current) {
          setPreparedHtml(temp.innerHTML)
        }
      }
      catch (err) {
        console.error('XHS HTML prepare error:', err)
        if (seq === prepareSeqRef.current) {
          setPreparedHtml(cleanInlineStyles(renderedHtml))
        }
      }
      finally {
        if (seq === prepareSeqRef.current) {
          setIsPreparing(false)
        }
      }
    }

    void prepare()
    return () => {
      abortController.abort()
    }
  }, [renderedHtml])

  const calculatePages = useCallback(async () => {
    const seq = paginationSeqRef.current + 1
    paginationSeqRef.current = seq
    const measure = measureRef.current
    if (!measure || !preparedHtml) {
      setRenderedPages([])
      return
    }

    await document.fonts.ready
    if (seq !== paginationSeqRef.current) {
      return
    }

    const pages = buildSemanticPages(measure, xhsPaginationMode)
    if (seq === paginationSeqRef.current) {
      setRenderedPages(pages)
    }
  }, [preparedHtml, xhsPaginationMode])

  useEffect(() => {
    const fontCssHref = getXhsFontOption(xhsFontFamily).fontCssHref

    if (!fontCssHref) {
      return
    }

    let cancelled = false
    const selector = `link[data-xhs-font-stylesheet][href="${fontCssHref}"]`
    const existingStylesheet = document.head.querySelector<HTMLLinkElement>(selector)

    const recalculateAfterFontsReady = async () => {
      await document.fonts.ready

      if (!cancelled) {
        void calculatePages()
      }
    }

    if (existingStylesheet) {
      void recalculateAfterFontsReady()
      return () => {
        cancelled = true
      }
    }

    const stylesheet = document.createElement('link')
    stylesheet.rel = 'stylesheet'
    stylesheet.href = fontCssHref
    stylesheet.dataset.xhsFontStylesheet = 'true'
    const handleStylesheetLoad = () => {
      void recalculateAfterFontsReady()
    }
    const handleStylesheetError = () => {
      console.warn('XHS font stylesheet failed to load:', fontCssHref)
    }
    stylesheet.addEventListener('load', handleStylesheetLoad, { once: true })
    stylesheet.addEventListener('error', handleStylesheetError, { once: true })
    document.head.appendChild(stylesheet)

    return () => {
      cancelled = true
      stylesheet.removeEventListener('load', handleStylesheetLoad)
      stylesheet.removeEventListener('error', handleStylesheetError)
    }
  }, [calculatePages, xhsFontFamily])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void calculatePages()
    })

    return () => window.cancelAnimationFrame(frame)
  }, [calculatePages, xhsFontSize, xhsLineHeight, xhsPadding, xhsFontFamily])

  useEffect(() => {
    overflowFixCountRef.current = 0
  }, [preparedHtml, xhsPaginationMode, xhsFontSize, xhsLineHeight, xhsPadding, xhsFontFamily])

  useEffect(() => {
    if (renderedPages.length === 0) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      const exportPages = exportPagesRef.current
      if (!exportPages) {
        return
      }

      const overflowingExportPageIndex = getOverflowingExportPageIndex(exportPages)
      const overflowIndex = overflowingExportPageIndex - 1
      if (overflowIndex < 0) {
        return
      }

      const renderedExportPage = exportPages.querySelectorAll<HTMLElement>(
        '[data-xhs-export-page="true"]',
      )[overflowingExportPageIndex]

      if (overflowFixCountRef.current > renderedPages.length * 8 + 24) {
        console.warn('XHS pagination overflow could not be fully resolved')
        return
      }

      setRenderedPages((previousPages) => {
        const nextPages = previousPages.map(page => ({ ...page }))
        const overflowingPage = nextPages[overflowIndex]
        if (overflowingPage
          && renderedExportPage
          && fitLastImageBlockOnRenderedPage(overflowingPage, renderedExportPage)) {
          overflowFixCountRef.current += 1
          return nextPages
        }

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
    if (isRendering || isPreparing) {
      return '渲染中'
    }

    return `共 ${renderedPages.length + 1} 张`
  }, [isRendering, isPreparing, renderedPages.length])

  const handleExport = async () => {
    setIsExporting(true)
    try {
      await exportXhsImages()
    }
    finally {
      setIsExporting(false)
    }
  }

  const handleExportPage = async (pageIndex: number) => {
    setExportingPageIndex(pageIndex)
    try {
      await exportXhsImage(pageIndex)
    }
    finally {
      setExportingPageIndex(null)
    }
  }

  const hasContent = renderedHtml.trim().length > 0
  const totalPageCount = renderedPages.length + 1

  return (
    <div className="flex size-full flex-col overflow-hidden">
      <style>
        {getXhsArticleCss(xhsFontSize, xhsLineHeight, xhsPadding, xhsFontFamily)}
      </style>
      <div className={`
        flex shrink-0 items-center justify-between gap-3 border-b bg-background
        px-4 py-3
      `}
      >
        <div className="flex min-w-0 items-center gap-3">
          <Popover>
            <PopoverTrigger
              render={(
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-md px-2.5"
                  aria-label="排版自定义设置"
                  title="排版自定义设置"
                >
                  <SlidersHorizontal className="size-4" />
                </Button>
              )}
            />
            <PopoverContent className="w-72 rounded-md p-4 select-none" align="start">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <h4 className="text-sm font-medium">排版选项</h4>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={`
                      size-6 text-muted-foreground
                      hover:text-foreground
                    `}
                    aria-label="重置为默认值"
                    title="重置为默认值"
                    onClick={() => {
                      setXhsFontSize(12.5)
                      setXhsLineHeight(1.55)
                      setXhsPadding(28)
                      setXhsFontFamily('sans-serif')
                      setXhsAuthorName('')
                      setXhsShowFooter(true)
                    }}
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                </div>

                {/* 字体家族选择 */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">字体样式</Label>
                  <Select value={xhsFontFamily} onValueChange={setXhsFontFamily}>
                    <SelectTrigger className={`
                      h-8 w-full rounded-md border bg-transparent text-xs
                    `}
                    >
                      <SelectValue>{getXhsFontOption(xhsFontFamily).label}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {XHS_FONT_OPTIONS.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">左下角作者</Label>
                    <Input
                      value={xhsAuthorName}
                      onChange={event => setXhsAuthorName(event.target.value)}
                      maxLength={24}
                      placeholder="@作者"
                      aria-label="小红书左下角作者"
                    />
                    <div className="flex flex-wrap gap-1.5" aria-label="作者快捷填充">
                      {XHS_AUTHOR_PRESETS.map(author => (
                        <Button
                          key={author}
                          type="button"
                          variant={xhsAuthorName === author ? 'secondary' : 'outline'}
                          size="xs"
                          className="rounded-md font-normal"
                          onClick={() => setXhsAuthorName(author)}
                        >
                          {author}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className={`
                    flex items-center justify-between rounded-md border px-3
                    py-2
                  `}
                  >
                    <Label
                      className="text-xs text-muted-foreground"
                      htmlFor="xhs-show-footer"
                    >
                      显示右下角页码
                    </Label>
                    <Checkbox
                      id="xhs-show-footer"
                      checked={xhsShowFooter}
                      onCheckedChange={setXhsShowFooter}
                      aria-label="显示小红书右下角页码"
                    />
                  </div>
                </div>

                {/* 字体大小滑块 */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <Label className="text-muted-foreground">字体大小</Label>
                    <span className="font-mono text-muted-foreground">
                      {xhsFontSize}
                      px
                    </span>
                  </div>
                  <XhsSlider
                    key={xhsFontSize}
                    value={xhsFontSize}
                    onValueCommit={setXhsFontSize}
                    min={10}
                    max={18}
                    step={0.5}
                    ariaLabel="小红书字体大小"
                  />
                </div>

                {/* 行间距滑块 */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <Label className="text-muted-foreground">行间距</Label>
                    <span className="font-mono text-muted-foreground">{xhsLineHeight}</span>
                  </div>
                  <XhsSlider
                    key={xhsLineHeight}
                    value={xhsLineHeight}
                    onValueCommit={setXhsLineHeight}
                    min={1.2}
                    max={2.2}
                    step={0.05}
                    ariaLabel="小红书行间距"
                  />
                </div>

                {/* 页边距滑块 */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <Label className="text-muted-foreground">页边距</Label>
                    <span className="font-mono text-muted-foreground">
                      {xhsPadding}
                      px
                    </span>
                  </div>
                  <XhsSlider
                    key={xhsPadding}
                    value={xhsPadding}
                    onValueCommit={setXhsPadding}
                    min={16}
                    max={48}
                    step={2}
                    ariaLabel="小红书页边距"
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>

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
          disabled={!hasContent || isRendering || isExporting || exportingPageIndex !== null}
          onClick={handleExport}
        >
          <Download className="size-4" />
          {isExporting ? '导出中' : '导出所有图片'}
        </Button>
      </div>

      <div className="relative flex-1 overflow-auto bg-editor px-6 py-8">
        <div
          ref={measureRef}
          className={`
            xhs-article pointer-events-none fixed top-0 left-[-9999px]
          `}
          dangerouslySetInnerHTML={{ __html: preparedHtml }}
        />

        <div
          className={`
            pointer-events-none fixed top-0 left-[-9999px] flex flex-col gap-6
          `}
          ref={exportPagesRef}
        >
          <XhsPage
            coverDocument={coverDocument}
            markdownStyle={markdownStyle}
            authorName=""
            footerLabel=""
            exportPage
          />
          {renderedPages.map((page, index) => (
            <XhsPage
              key={`export-${page.id}`}
              html={page.html}
              markdownStyle={markdownStyle}
              authorName={xhsAuthorName}
              footerLabel={xhsShowFooter
                ? formatXhsContentPageFooter(index, renderedPages.length)
                : ''}
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
            <div className={`
              group relative flex w-fit flex-col items-center gap-3
            `}
            >
              <div className="text-center text-xs text-muted-foreground">
                1 /
                {' '}
                {totalPageCount}
              </div>
              <div className={`
                absolute top-7 -right-11 z-10 flex flex-col gap-2 opacity-0
                group-focus-within:opacity-100
                group-hover:opacity-100
              `}
              >
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="size-8 rounded-md shadow-sm"
                  disabled={!activeFileId}
                  onClick={() => setCoverEditorOpen(true)}
                  aria-label="编辑小红书封面"
                  title="编辑小红书封面"
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="size-8 rounded-md shadow-sm"
                  disabled={isExporting || exportingPageIndex !== null}
                  onClick={() => void handleExportPage(0)}
                  aria-label="下载第 1 张图片"
                  title="下载第 1 张图片"
                >
                  <Download className="size-4" />
                </Button>
              </div>
              <div
                className="origin-top overflow-hidden rounded-md border"
                style={{
                  width: XHS_PREVIEW_WIDTH,
                  height: XHS_PAGE_HEIGHT * XHS_PREVIEW_SCALE,
                  background: getXhsPageBackground(markdownStyle),
                }}
              >
                <div style={{ width: XHS_PAGE_WIDTH, height: XHS_PAGE_HEIGHT, transform: `scale(${XHS_PREVIEW_SCALE})`, transformOrigin: 'top left' }}>
                  <XhsPage
                    coverDocument={coverDocument}
                    markdownStyle={markdownStyle}
                    authorName=""
                    footerLabel=""
                  />
                </div>
              </div>
            </div>
            {renderedPages.map((page, index) => (
              <div
                key={`preview-${page.id}`}
                className={`
                  group relative flex w-fit flex-col items-center gap-3
                `}
              >
                <div className="text-center text-xs text-muted-foreground">
                  {index + 2}
                  {' '}
                  /
                  {totalPageCount}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className={`
                    absolute top-7 -right-11 z-10 size-8 rounded-md opacity-0
                    shadow-sm
                    group-focus-within:opacity-100
                    group-hover:opacity-100
                    focus-visible:opacity-100
                  `}
                  disabled={isExporting || exportingPageIndex !== null}
                  onClick={() => void handleExportPage(index + 1)}
                  aria-label={`下载第 ${index + 2} 张图片`}
                  title={`下载第 ${index + 2} 张图片`}
                >
                  <Download className="size-4" />
                </Button>
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
                      authorName={xhsAuthorName}
                      footerLabel={xhsShowFooter
                        ? formatXhsContentPageFooter(index, renderedPages.length)
                        : ''}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {coverEditorOpen && activeFileId && (
        <XhsCoverEditor
          open={coverEditorOpen}
          fileId={activeFileId}
          document={coverDocument}
          savedStyleId={coverStyleId}
          onOpenChange={setCoverEditorOpen}
          onSaved={handleCoverSaved}
        />
      )}
    </div>
  )
}
