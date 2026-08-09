import {
  XHS_LAYOUT_SCALE,
  XHS_SOURCE_MEDIA_MAX_HEIGHT,
  XHS_SOURCE_MEDIA_MAX_WIDTH,
  XHS_SOURCE_PAGE_HEIGHT,
  XHS_SOURCE_WIDTH,
  XHS_USABLE_PAGE_HEIGHT,
} from '@/lib/xhs/preview-layout'
import { getXhsFontOption, getXhsTextFlowCss } from '@/lib/xhs/typography'

const XHS_THEME_SURFACES: Record<string, string> = {
  botanical: '#fffffe',
  kiko: '#fffffe',
  professional: '#fffffe',
}

export function getXhsPageBackground(markdownStyle: string) {
  return XHS_THEME_SURFACES[markdownStyle] ?? XHS_THEME_SURFACES.professional
}

export function getXhsArticleCss(fontSize: number, lineHeight: number, padding: number, fontFamily: string) {
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
