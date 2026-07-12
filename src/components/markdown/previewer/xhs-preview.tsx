import type { XhsCoverDocument } from '@/lib/xhs/cover-document'
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
import { mermaidConfig } from '@/config/mermaid'
import { exportXhsImage, exportXhsImages } from '@/lib/actions'
import { getMarkdownLocaleTexts } from '@/lib/locale'
import { createDefaultCoverDocument } from '@/lib/xhs/cover-document'
import { getCoverDocument } from '@/lib/xhs/cover-storage'
import { formatXhsPageFooter } from '@/lib/xhs/footer'
import { padMermaidViewBox } from '@/lib/xhs/mermaid-style'
import { getMediaFitScale } from '@/lib/xhs/pagination'
import { getXhsFontOption, getXhsTextFlowCss, XHS_FONT_OPTIONS } from '@/lib/xhs/typography'
import { useEditorStore } from '@/stores/editor'
import { useFilesStore } from '@/stores/files'
import { PREVIEW_WIDTH_MOBILE, usePreviewStore } from '@/stores/preview'
import { XhsCoverCanvas } from './xhs-cover-canvas'
import { XhsCoverEditor } from './xhs-cover-editor'

const XHS_PAGE_WIDTH = 720
const XHS_PAGE_HEIGHT = 960
const XHS_PREVIEW_WIDTH = 540
const XHS_PREVIEW_SCALE = XHS_PREVIEW_WIDTH / XHS_PAGE_WIDTH
const XHS_LAYOUT_SCALE = XHS_PAGE_WIDTH / PREVIEW_WIDTH_MOBILE
const XHS_SOURCE_WIDTH = XHS_PAGE_WIDTH
const XHS_SOURCE_PAGE_HEIGHT = XHS_PAGE_HEIGHT
const XHS_EXPORT_MEDIA_MAX_WIDTH = 600
const XHS_EXPORT_MEDIA_MAX_HEIGHT = 360
const XHS_SOURCE_MEDIA_MAX_WIDTH = XHS_EXPORT_MEDIA_MAX_WIDTH
const XHS_SOURCE_MEDIA_MAX_HEIGHT = XHS_EXPORT_MEDIA_MAX_HEIGHT
const XHS_SOURCE_FOOTER_SAFE_AREA = Math.round(34 * XHS_LAYOUT_SCALE)
const XHS_USABLE_PAGE_HEIGHT = XHS_SOURCE_PAGE_HEIGHT - XHS_SOURCE_FOOTER_SAFE_AREA
const XHS_SPARSE_PAGE_HEIGHT = Math.round(112 * XHS_LAYOUT_SCALE)
const XHS_PAGE_HEIGHT_TOLERANCE = 45
const XHS_MIN_MEDIA_FIT_SCALE = 0.8
const XHS_RENDER_DEBOUNCE_MS = 250

const XHS_THEME_SURFACES: Record<string, string> = {
  botanical: '#fffffe',
  kiko: '#fffffe',
  professional: '#fffffe',
}

function getXhsPageBackground(markdownStyle: string) {
  return XHS_THEME_SURFACES[markdownStyle] ?? XHS_THEME_SURFACES.professional
}

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

function getXhsArticleCss(fontSize: number, lineHeight: number, padding: number, fontFamily: string) {
  const scaledFontSize = fontSize * XHS_LAYOUT_SCALE
  const scaledPadding = padding * XHS_LAYOUT_SCALE
  const topPadding = Math.round(scaledPadding * 1.28)
  const bottomPadding = Math.round(scaledPadding * 1.71)
  const fontList = getXhsFontOption(fontFamily).fontFamily
  const isOppoSans = fontFamily === 'oppo-sans'
  const bodyFontWeight = isOppoSans ? 300 : 400
  const bodyLetterSpacing = isOppoSans ? '0.035em' : 'normal'
  const paragraphSpacing = isOppoSans ? '1.35em' : '0.8em'

  return `
.xhs-article {
  width: ${XHS_SOURCE_WIDTH}px;
  min-height: ${XHS_SOURCE_PAGE_HEIGHT}px;
  box-sizing: border-box;
  background: transparent;
  letter-spacing: normal;
  padding: ${topPadding}px ${scaledPadding}px ${bottomPadding}px ${scaledPadding}px;
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
  font-family: ${fontList} !important;
  font-size: ${scaledFontSize}px !important;
  font-weight: ${bodyFontWeight} !important;
  line-height: ${lineHeight} !important;
  letter-spacing: ${bodyLetterSpacing} !important;
}

.xhs-article #bm-md,
.xhs-article #bm-md p,
.xhs-article #bm-md li,
.xhs-article #bm-md span,
.xhs-article #bm-md strong,
.xhs-article #bm-md a,
.xhs-article #bm-md h1,
.xhs-article #bm-md h2,
.xhs-article #bm-md h3,
.xhs-article #bm-md h4,
.xhs-article #bm-md h5,
.xhs-article #bm-md h6 {
  font-family: ${fontList} !important;
}

/* 优化段落和行内元素 */
.xhs-article #bm-md p {
  font-size: ${scaledFontSize}px !important;
  font-weight: ${bodyFontWeight} !important;
  line-height: ${lineHeight} !important;
  letter-spacing: ${bodyLetterSpacing} !important;
  margin-top: 0 !important;
  margin-bottom: ${paragraphSpacing} !important;
${getXhsTextFlowCss()}
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
  font-size: ${Math.max(scaledFontSize - 0.5 * XHS_LAYOUT_SCALE, 9 * XHS_LAYOUT_SCALE)}px !important;
  line-height: ${lineHeight - 0.05} !important;
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
  letter-spacing: ${isOppoSans ? '-0.025em' : 'normal'} !important;
  margin-top: 1.2em !important;
  margin-bottom: 0.6em !important;
  font-family: ${fontList} !important;
}

.xhs-article #bm-md h1 {
  font-size: ${Math.round(scaledFontSize * 1.92)}px !important;
}

.xhs-article #bm-md h2 {
  font-size: ${Math.round(scaledFontSize * 1.6)}px !important;
  border-bottom: none !important;
  padding-bottom: 0 !important;
}

.xhs-article #bm-md h3 {
  font-size: ${Math.round(scaledFontSize * 1.44)}px !important;
}

.xhs-article #bm-md h4 {
  font-size: ${Math.round(scaledFontSize * 1.28)}px !important;
}

/* 优化引用块 */
.xhs-article #bm-md blockquote {
  margin: 0.8em 0 !important;
  padding: ${8 * XHS_LAYOUT_SCALE}px ${14 * XHS_LAYOUT_SCALE}px !important;
  border-left: ${4 * XHS_LAYOUT_SCALE}px solid currentColor !important;
  background: rgba(0, 0, 0, 0.02) !important;
  border-radius: 0 ${6 * XHS_LAYOUT_SCALE}px ${6 * XHS_LAYOUT_SCALE}px 0 !important;
}

.xhs-article #bm-md blockquote p {
  font-size: ${scaledFontSize + 1.5 * XHS_LAYOUT_SCALE}px !important;
  font-style: italic !important;
  margin: 0 !important;
  opacity: 0.85 !important;
}

/* 隐藏正文内的生硬分隔符，保持小红书卡片清爽 */
.xhs-article #bm-md hr {
  display: none !important;
}

/* 优化 markdown 中的 mark 高亮标记 (鹅黄色高亮) */
.xhs-article #bm-md mark {
  background-color: rgba(253, 224, 71, 0.45) !important;
  color: inherit !important;
  font-weight: 600 !important;
  border-radius: ${3 * XHS_LAYOUT_SCALE}px !important;
  padding: 0 ${3 * XHS_LAYOUT_SCALE}px !important;
  margin: 0 ${1 * XHS_LAYOUT_SCALE}px !important;
}

.xhs-article #bm-md mark[data-highlight='red'] {
  background-color: #f3d6d3 !important;
  color: #693733 !important;
}

.xhs-article #bm-md mark[data-highlight='blue'] {
  background-color: #d9e6f3 !important;
  color: #304f6e !important;
}

.xhs-article #bm-md mark[data-highlight='green'] {
  background-color: #dceadf !important;
  color: #34563d !important;
}

.xhs-article #bm-md mark[data-highlight='purple'] {
  background-color: #e7def0 !important;
  color: #554069 !important;
}

.xhs-article #bm-md mark[data-highlight='gray'] {
  background-color: #e7e8ea !important;
  color: #444b55 !important;
}

.xhs-cover {
  display: flex;
  min-height: ${XHS_USABLE_PAGE_HEIGHT}px;
  flex-direction: column;
  justify-content: center;
  gap: ${18 * XHS_LAYOUT_SCALE}px;
  padding: ${topPadding + 12 * XHS_LAYOUT_SCALE}px ${scaledPadding + 6 * XHS_LAYOUT_SCALE}px;
}

.xhs-cover-title {
  max-width: 100%;
  margin: 0 !important;
  font-size: ${Math.round(scaledFontSize * 2.72)}px !important;
  font-weight: 700 !important;
  line-height: 1.16 !important;
  font-family: ${fontList} !important;
}

.xhs-cover-subtitle {
  max-width: 100%;
  margin: 0 !important;
  font-size: ${scaledFontSize + 2.5 * XHS_LAYOUT_SCALE}px !important;
  line-height: 1.55 !important;
  font-family: ${fontList} !important;
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
  right: ${44 * XHS_LAYOUT_SCALE}px;
  bottom: ${34 * XHS_LAYOUT_SCALE}px;
  font-family: "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: ${16 * XHS_LAYOUT_SCALE}px;
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
  max-height: ${XHS_SOURCE_MEDIA_MAX_HEIGHT}px !important;
  height: auto !important;
  object-fit: contain !important;
}

.xhs-article figure {
  width: 100% !important;
  max-width: 100% !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
  overflow: visible !important;
  break-inside: avoid !important;
}

.xhs-article figure.figure-image,
.xhs-article figure.figure-image > a,
.xhs-article figure.figure-image > picture {
  display: block !important;
  width: 100% !important;
  max-width: 100% !important;
  text-align: center !important;
}

.xhs-article figure.figure-image img {
  display: block !important;
  width: auto !important;
  max-width: min(100%, ${XHS_SOURCE_MEDIA_MAX_WIDTH}px) !important;
  height: auto !important;
  max-height: ${XHS_SOURCE_MEDIA_MAX_HEIGHT}px !important;
  object-fit: contain !important;
  margin: 0 auto !important;
}

.xhs-article figcaption {
  display: none !important;
}

.xhs-article pre {
  margin: 0.6em 0 !important;
  padding: 1.6em 0.8em 0.8em 0.8em !important;
  font-size: ${Math.max(scaledFontSize - 2 * XHS_LAYOUT_SCALE, 9.5 * XHS_LAYOUT_SCALE)}px !important;
  line-height: 1.4 !important;
  overflow: hidden !important;
  overflow-x: hidden !important;
  overflow-y: hidden !important;
  white-space: pre-wrap !important;
  scrollbar-width: none !important;
}

.xhs-article #bm-md pre::-webkit-scrollbar,
.xhs-article #bm-md pre::-webkit-scrollbar-button,
.xhs-article #bm-md pre::-webkit-scrollbar-track,
.xhs-article #bm-md pre::-webkit-scrollbar-thumb,
.xhs-article #bm-md figure.figure-table::-webkit-scrollbar,
.xhs-article #bm-md figure.figure-table::-webkit-scrollbar-button,
.xhs-article #bm-md figure.figure-table::-webkit-scrollbar-track,
.xhs-article #bm-md figure.figure-table::-webkit-scrollbar-thumb {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}

.xhs-article pre::after {
  display: none !important;
  content: none !important;
}

.xhs-article pre > span:empty {
  display: none !important;
}

.xhs-article pre code {
  display: block !important;
  min-width: 0 !important;
  width: 100% !important;
  max-width: 100% !important;
  font-size: ${Math.max(scaledFontSize - 2 * XHS_LAYOUT_SCALE, 9.5 * XHS_LAYOUT_SCALE)}px !important;
  line-height: 1.4 !important;
  white-space: pre-wrap !important;
  overflow-wrap: anywhere !important;
  word-break: break-word !important;
  overflow: hidden !important;
}

.xhs-article pre code * {
  min-width: 0 !important;
  max-width: 100% !important;
  font-size: ${Math.max(scaledFontSize - 2 * XHS_LAYOUT_SCALE, 9.5 * XHS_LAYOUT_SCALE)}px !important;
  line-height: 1.4 !important;
  white-space: pre-wrap !important;
  overflow-wrap: anywhere !important;
  word-break: break-word !important;
}

.xhs-article table {
  width: 100% !important;
  max-width: 100% !important;
  table-layout: fixed !important;
  font-size: ${Math.max(scaledFontSize - 2.5 * XHS_LAYOUT_SCALE, 9 * XHS_LAYOUT_SCALE)}px !important;
  line-height: 1.35 !important;
  margin: 0.6em 0 !important;
  border-collapse: collapse !important;
  break-inside: avoid !important;
}

.xhs-article figure.figure-table {
  overflow: hidden !important;
  overflow-x: hidden !important;
  overflow-y: hidden !important;
  scrollbar-width: none !important;
}

.xhs-article th,
.xhs-article td {
  min-width: 0 !important;
  max-width: none !important;
  padding: ${5 * XHS_LAYOUT_SCALE}px ${6 * XHS_LAYOUT_SCALE}px !important;
  font-size: ${Math.max(scaledFontSize - 2.5 * XHS_LAYOUT_SCALE, 9 * XHS_LAYOUT_SCALE)}px !important;
  line-height: 1.35 !important;
  vertical-align: top !important;
  white-space: normal !important;
  overflow-wrap: anywhere !important;
  word-break: break-word !important;
}

.xhs-article .mermaid {
  --fg: #0f172a;
  --bg: #fffffe;

  /* 基于 Two-Color Foundation 算法衍生调和色系 */
  --text: var(--fg);
  --text-muted: color-mix(in srgb, var(--fg) 60%, var(--bg));
  --connectors: color-mix(in srgb, var(--fg) 40%, var(--bg));
  --arrow: color-mix(in srgb, var(--fg) 75%, var(--bg));
  --node-fill: color-mix(in srgb, var(--fg) 3%, var(--bg));
  --node-border: color-mix(in srgb, var(--fg) 12%, var(--bg));
  --subgraph-fill: color-mix(in srgb, var(--fg) 4%, var(--bg));
  --subgraph-border: color-mix(in srgb, var(--fg) 18%, var(--bg));

  display: flex !important;
  justify-content: center !important;
  align-items: center !important;
  width: 100% !important;
  max-width: 100% !important;
  margin: ${16 * XHS_LAYOUT_SCALE}px 0 !important;
  padding: 0 !important;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
  break-inside: avoid !important;
  max-height: ${Math.round(XHS_USABLE_PAGE_HEIGHT * 0.8)}px !important;
}

.xhs-article .mermaid svg {
  max-width: 100% !important;
  max-height: 100% !important;
  height: auto !important;
  width: auto !important;
  display: block !important;
}

/* === 运用 CSS 变量强行渲染 SVG 内部元素 === */

/* 1. 节点（Nodes） */
.xhs-article .mermaid svg .node rect,
.xhs-article .mermaid svg .node circle,
.xhs-article .mermaid svg .node polygon,
.xhs-article .mermaid svg .node path {
  fill: var(--node-fill) !important;
  stroke: var(--node-border) !important;
  stroke-width: ${1.5 * XHS_LAYOUT_SCALE}px !important;
  rx: ${8 * XHS_LAYOUT_SCALE}px !important;
  ry: ${8 * XHS_LAYOUT_SCALE}px !important;
  filter: drop-shadow(0 ${2 * XHS_LAYOUT_SCALE}px ${4 * XHS_LAYOUT_SCALE}px rgba(0, 0, 0, 0.015)) !important;
}

/* 2. 连线（Edges）与箭头（Markers） */
.xhs-article .mermaid svg .edgePath .path {
  stroke: var(--connectors) !important;
  stroke-width: ${1.5 * XHS_LAYOUT_SCALE}px !important;
}

.xhs-article .mermaid svg .marker {
  fill: var(--arrow) !important;
  stroke: none !important;
}

/* 3. 子图（Subgraph / Cluster） */
.xhs-article .mermaid svg .cluster rect {
  fill: var(--subgraph-fill) !important;
  stroke: var(--subgraph-border) !important;
  stroke-width: ${1 * XHS_LAYOUT_SCALE}px !important;
  rx: ${12 * XHS_LAYOUT_SCALE}px !important;
  ry: ${12 * XHS_LAYOUT_SCALE}px !important;
}

.xhs-article .mermaid svg .cluster .label {
  font-weight: 600 !important;
  fill: var(--text-muted) !important;
}

/* 4. 节点文本 */
.xhs-article .mermaid svg .label,
.xhs-article .mermaid svg .node .label,
.xhs-article .mermaid svg .node .label * {
  font-family: inherit !important;
  font-weight: 500 !important;
  fill: var(--text) !important;
}

/* 5. 连线文字背景与文字 */
.xhs-article .mermaid svg .edgeLabel rect {
  fill: #ffffff !important;
  rx: ${4 * XHS_LAYOUT_SCALE}px !important;
  ry: ${4 * XHS_LAYOUT_SCALE}px !important;
}

.xhs-article .mermaid svg .edgeLabel span {
  color: var(--text-muted) !important;
  font-size: 0.9em !important;
}

/* === 针对 classDef 类别的高级设计覆盖 === */
/* 入口/起点 */
.xhs-article .mermaid svg .node.entry rect,
.xhs-article .mermaid svg .node.entry path {
  fill: var(--fg) !important;
  stroke: var(--fg) !important;
}
.xhs-article .mermaid svg .node.entry .label {
  fill: var(--bg) !important;
}

/* 核心节点 */
.xhs-article .mermaid svg .node.core rect,
.xhs-article .mermaid svg .node.core path {
  --node-fill: #eff6ff;
  --node-border: #bfdbfe;
  --text: #1e3a8a;
}

/* 扩展节点 */
.xhs-article .mermaid svg .node.extension rect,
.xhs-article .mermaid svg .node.extension path {
  --node-fill: #fff7ed;
  --node-border: #fed7aa;
  --text: #7c2d12;
}

/* 工具/虚线框节点 */
.xhs-article .mermaid svg .node.tools rect,
.xhs-article .mermaid svg .node.tools path {
  --node-fill: #f8fafc;
  --node-border: #cbd5e1;
  stroke-dasharray: ${4 * XHS_LAYOUT_SCALE}px ${3 * XHS_LAYOUT_SCALE}px !important;
}

/* 模型底座 */
.xhs-article .mermaid svg .node.model rect,
.xhs-article .mermaid svg .node.model path {
  --node-fill: #fafafa;
  --node-border: #cbd5e1;
}
`
}

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

// 将 SVG 字符串通过 Canvas 栅格化为高清 PNG data URL
async function svgToPng(svgString: string, scale = 3): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const svgData = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgString)))}`

    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width * scale
      canvas.height = img.height * scale

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Failed to get canvas context'))
        return
      }

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      try {
        resolve(canvas.toDataURL('image/png'))
      }
      catch (e) {
        reject(e)
      }
    }

    img.onerror = () => reject(new Error('Failed to load SVG image'))
    img.src = svgData
  })
}

async function renderMermaidNodes(container: HTMLElement) {
  const nodes = Array.from(
    container.querySelectorAll('.mermaid:not([data-processed="true"])'),
  ) as HTMLElement[]

  if (nodes.length === 0) {
    return
  }

  const mermaid = await loadMermaid()

  const state = usePreviewStore.getState()
  const baseFontSize = state.xhsFontSize || 14
  const xhsLayoutScale = 720 / 375
  const targetFontSize = Math.round(baseFontSize * xhsLayoutScale * 1.45)

  mermaid.initialize({
    ...mermaidConfig,
    themeVariables: {
      ...mermaidConfig.themeVariables,
      fontSize: `${Math.max(targetFontSize, 24)}px`,
    },
    flowchart: {
      ...mermaidConfig.flowchart,
      nodeSpacing: Math.round(26 * xhsLayoutScale),
      rankSpacing: Math.round(18 * xhsLayoutScale),
      padding: Math.round(10 * xhsLayoutScale),
    },
  })

  await Promise.all(nodes.map(async (node, index) => {
    try {
      const id = `xhs-mermaid-${Date.now()}-${index}`
      const rawText = node.textContent || ''

      // 剥离内联 %%{init: ... }%% 块，让底层配置生效
      const text = rawText.replace(/%%\{init:[\s\S]*?\}%%/gi, '')

      const { svg: rawSvg } = await mermaid.render(id, text)

      // 预处理 SVG：补全尺寸属性、注入白底
      const parser = new DOMParser()
      const svgDoc = parser.parseFromString(rawSvg, 'image/svg+xml')
      const svgEl = svgDoc.documentElement

      const viewBox = svgEl.getAttribute('viewBox')
      if (viewBox) {
        const parts = viewBox.split(/\s+|,/).map(Number.parseFloat)
        const [vx, vy, vw, vh] = parts
        if ([vx, vy, vw, vh].every(value => value !== undefined && !Number.isNaN(value))) {
          const padded = padMermaidViewBox({
            x: vx ?? 0,
            y: vy ?? 0,
            width: vw ?? 0,
            height: vh ?? 0,
          })
          svgEl.setAttribute('viewBox', `${padded.x} ${padded.y} ${padded.width} ${padded.height}`)
          svgEl.setAttribute('width', `${padded.width}px`)
          svgEl.setAttribute('height', `${padded.height}px`)
          svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet')
        }
      }

      // 白底 rect 防止透明背景在 Canvas 中变黑
      const bgRect = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'rect')
      bgRect.setAttribute('width', '100%')
      bgRect.setAttribute('height', '100%')
      bgRect.setAttribute('fill', '#ffffff')
      if (svgEl.firstChild) {
        svgEl.insertBefore(bgRect, svgEl.firstChild)
      }
      else {
        svgEl.appendChild(bgRect)
      }

      // 将 beautiful-mermaid 风格的美化样式直接注入 SVG 内部，
      // 因为 Canvas 栅格化时外部 CSS 不生效，必须内嵌。
      // 颜色基于 Two-Color Foundation 预计算：fg=#0f172a, bg=#fffffe
      const styleEl = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'style')
      styleEl.textContent = `
        /* 节点形状 */
        .node rect, .node circle, .node polygon, .node path {
          fill: #e8eef8 !important;
          stroke: #bcc9d8 !important;
          stroke-width: 1.75px !important;
          rx: 12px;
          ry: 12px;
        }
        .nodes > .node:nth-child(4n + 2) rect,
        .nodes > .node:nth-child(4n + 2) circle,
        .nodes > .node:nth-child(4n + 2) polygon,
        .nodes > .node:nth-child(4n + 2) path {
          fill: #e7f1eb !important;
          stroke: #b9d2c2 !important;
        }
        .nodes > .node:nth-child(4n + 3) rect,
        .nodes > .node:nth-child(4n + 3) circle,
        .nodes > .node:nth-child(4n + 3) polygon,
        .nodes > .node:nth-child(4n + 3) path {
          fill: #f5ecdf !important;
          stroke: #ddc7aa !important;
        }
        .nodes > .node:nth-child(4n) rect,
        .nodes > .node:nth-child(4n) circle,
        .nodes > .node:nth-child(4n) polygon,
        .nodes > .node:nth-child(4n) path {
          fill: #eee9f5 !important;
          stroke: #cfc1df !important;
        }
        /* 连线 */
        .edgePath .path {
          stroke: #8290a3 !important;
          stroke-width: 1.75px !important;
        }
        /* 箭头 */
        marker path {
          fill: #66758a !important;
          stroke: none !important;
        }
        /* 子图 */
        .cluster rect {
          fill: #f7f8fa !important;
          stroke: #d8dde5 !important;
          stroke-width: 1px !important;
          rx: 10px;
          ry: 10px;
        }
        .cluster .nodeLabel {
          font-weight: 600 !important;
          color: #6f7380 !important;
        }
        /* 节点文本 */
        .nodeLabel {
          font-family: Inter, "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif !important;
          font-size: ${Math.max(targetFontSize, 24)}px !important;
          line-height: 1.35 !important;
          font-weight: 600 !important;
          color: #273444 !important;
        }
        /* 连线标签 */
        .edgeLabel {
          font-family: Inter, "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif !important;
          font-size: ${Math.max(targetFontSize - 5, 18)}px !important;
          font-weight: 500 !important;
          color: #66758a !important;
        }
        .edgeLabel rect {
          fill: #ffffff !important;
          rx: 4px;
          ry: 4px;
        }
        /* SVG text 元素兜底 */
        text, tspan {
          font-family: Inter, "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif !important;
        }
      `
      // 插入到白底 rect 之后（确保 style 位于 SVG 前部生效）
      if (bgRect.nextSibling) {
        svgEl.insertBefore(styleEl, bgRect.nextSibling)
      }
      else {
        svgEl.appendChild(styleEl)
      }

      const processedSvg = new XMLSerializer().serializeToString(svgEl)

      // 3x Retina 栅格化为 PNG，字号被"烧录"进位图，不再受容器缩放影响
      const pngDataUrl = await svgToPng(processedSvg, 3)

      // 用 <img> 替换 SVG，html2canvas 可完美识别
      node.innerHTML = `<img src="${pngDataUrl}" style="width: 100%; height: auto; display: block;" alt="Mermaid Diagram" />`
      node.setAttribute('data-processed', 'true')
    }
    catch (error) {
      console.error('Mermaid render error:', error)
      node.innerHTML = `<p class="text-red-500 font-mono text-sm p-2 bg-red-50 rounded">${error instanceof Error ? error.message : String(error)}</p>`
    }
  }))
}

function cleanInlineStyles(html: string) {
  return html
    .replace(/font-family\s*:[^;"]+;?/gi, '')
    .replace(/font-size\s*:[^;"]+;?/gi, '')
    .replace(/line-height\s*:[^;"]+;?/gi, '')
}

function XhsPage({
  html,
  coverDocument,
  markdownStyle,
  authorName,
  footerLabel,
  exportPage = false,
}: {
  html?: string
  coverDocument?: XhsCoverDocument
  markdownStyle: string
  authorName: string
  footerLabel: string
  exportPage?: boolean
}) {
  const pageBackground = getXhsPageBackground(markdownStyle)
  const normalizedAuthor = authorName.trim()
  const normalizedFooter = footerLabel.trim()

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
      {coverDocument
        ? <XhsCoverCanvas document={coverDocument} />
        : (
            <div className="xhs-article xhs-page-article">
              <div
                id="bm-md"
                style={{ background: 'transparent', padding: 0, margin: 0, width: '100%', minHeight: 'auto' }}
                dangerouslySetInnerHTML={{ __html: html ?? '' }}
              />
            </div>
          )}
      {(normalizedAuthor || normalizedFooter) && (
        <>
          {/* 页脚上方的精致分割线 */}
          <div
            className="absolute right-10 left-10 border-t border-black/10"
            style={{ bottom: 54 }}
          />
          <div
            className={`
              pointer-events-none absolute right-10 bottom-7 left-10 flex
              items-end justify-between gap-6 text-[18px] leading-none
              tracking-wide text-black/45
            `}
          >
            <span className="min-w-0 truncate text-left">{normalizedAuthor}</span>
            <span className="min-w-0 truncate text-right">{normalizedFooter}</span>
          </div>
        </>
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

  const image = measuredElement.matches('img')
    ? measuredElement as HTMLImageElement
    : measuredElement.querySelector<HTMLImageElement>('img')
  const mediaCount = measuredElement.matches('img, video, svg, canvas, iframe')
    ? 1
    : measuredElement.querySelectorAll('img, video, svg, canvas, iframe').length

  if (!image || mediaCount !== 1) {
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
  const fittedImage = fitted.matches('img')
    ? fitted as HTMLImageElement
    : fitted.querySelector<HTMLImageElement>('img')
  if (!fittedImage) {
    return null
  }

  fittedImage.style.setProperty('width', `${Math.round(imageRect.width * scale)}px`, 'important')
  fittedImage.style.setProperty('height', 'auto', 'important')
  fittedImage.style.setProperty('max-height', 'none', 'important')

  const fittedHtml = fitted.outerHTML
  return fitsPage(probe, `${currentHtml}${fittedHtml}`) ? fittedHtml : null
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

const inlineImageCache = new Map<string, string>()
const MAX_INLINE_IMAGE_CACHE_SIZE = 64

function cacheInlineImage(url: string, dataUrl: string) {
  if (inlineImageCache.size >= MAX_INLINE_IMAGE_CACHE_SIZE) {
    const oldestKey = inlineImageCache.keys().next().value
    if (oldestKey) {
      inlineImageCache.delete(oldestKey)
    }
  }
  inlineImageCache.set(url, dataUrl)
}

async function inlineRemoteImages(container: HTMLElement, signal: AbortSignal) {
  const images = Array.from(container.querySelectorAll('img'))

  await Promise.all(images.map(async (image) => {
    if (signal.aborted) {
      return
    }

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
      const cached = inlineImageCache.get(url.href)
      if (cached) {
        image.src = cached
        image.removeAttribute('srcset')
        image.removeAttribute('sizes')
        return
      }

      const response = await fetch(url.href, { signal })
      if (!response.ok) {
        return
      }

      const dataUrl = await blobToDataUrl(await response.blob())
      if (signal.aborted) {
        return
      }

      cacheInlineImage(url.href, dataUrl)
      image.src = dataUrl
      image.removeAttribute('srcset')
      image.removeAttribute('sizes')
    }
    catch (error) {
      if (signal.aborted) {
        return
      }
      console.warn('Inline XHS image failed:', source, error)
    }
  }))
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

  useEffect(() => {
    if (!activeFileId) {
      setCoverDocument(createDefaultCoverDocument(''))
      setHasCustomCover(false)
      return
    }

    let active = true
    const load = async () => {
      const stored = await getCoverDocument(activeFileId)
      if (active) {
        if (stored) {
          setCoverDocument(stored)
          setHasCustomCover(true)
        }
        else {
          setCoverDocument(createDefaultCoverDocument(content))
          setHasCustomCover(false)
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

      const overflowIndex = getOverflowingExportPageIndex(exportPages) - 1
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
            authorName={xhsAuthorName}
            footerLabel={xhsShowFooter ? formatXhsPageFooter(1, totalPageCount) : ''}
            exportPage
          />
          {renderedPages.map((page, index) => (
            <XhsPage
              key={`export-${page.id}`}
              html={page.html}
              markdownStyle={markdownStyle}
              authorName={xhsAuthorName}
              footerLabel={xhsShowFooter
                ? formatXhsPageFooter(index + 2, totalPageCount)
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
                    authorName={xhsAuthorName}
                    footerLabel={xhsShowFooter ? formatXhsPageFooter(1, totalPageCount) : ''}
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
                        ? formatXhsPageFooter(index + 2, totalPageCount)
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
          onOpenChange={setCoverEditorOpen}
          onSaved={handleCoverSaved}
        />
      )}
    </div>
  )
}
