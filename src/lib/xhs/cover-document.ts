export const XHS_COVER_WIDTH = 720 as const
export const XHS_COVER_HEIGHT = 960 as const
export const XHS_DEFAULT_TEXT_SHADOW = {
  color: '#2e85ff',
  offsetX: 5,
  offsetY: 5,
  blur: 0,
} as const
export const XHS_DEFAULT_IMAGE_STYLE = {
  borderRadius: 0,
  shadowColor: '#111111',
  shadowOpacity: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 12,
  shadowBlur: 28,
  bottomBlurEnabled: false,
  bottomBlurHeight: 36,
  bottomBlurAmount: 12,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
} as const

export type XhsCoverTemplateId = 'blueprint' | 'editorial'

export interface XhsCoverTemplateMeta {
  id: XhsCoverTemplateId
  name: string
  description: string
  swatch: {
    background: string
    accent: string
    text: string
  }
}

export const XHS_COVER_TEMPLATES: readonly XhsCoverTemplateMeta[] = [
  {
    id: 'blueprint',
    name: '品牌蓝图',
    description: '清爽蓝标，适合系列内容',
    swatch: { background: '#ffffff', accent: '#2854e8', text: '#111111' },
  },
  {
    id: 'editorial',
    name: '纸上编辑',
    description: '极简留白，彩色立体卡片',
    swatch: { background: '#fbfbfa', accent: '#504fd8', text: '#202226' },
  },
] as const

export interface XhsCoverElementBase {
  id: string
  x: number
  y: number
  width: number
  height: number
  zIndex: number
}

export interface XhsCoverTextElement extends XhsCoverElementBase {
  type: 'text'
  text: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  color: string
  highlightColor: string
  textStrokeColor: string
  textStrokeWidth: number
  textShadowColor: string
  textShadowOffsetX: number
  textShadowOffsetY: number
  textShadowBlur: number
  textAlign: 'left' | 'center' | 'right'
  verticalAlign: 'top' | 'middle' | 'bottom'
  lineHeight: number
  backgroundColor: string
  borderColor: string
  borderWidth: number
  borderRadius: number
}

export interface XhsCoverImageElement extends XhsCoverElementBase {
  type: 'image'
  src: string
  aspectRatio: number
  alt: string
  borderRadius: number
  shadowColor: string
  shadowOpacity: number
  shadowOffsetX: number
  shadowOffsetY: number
  shadowBlur: number
  bottomBlurEnabled: boolean
  bottomBlurHeight: number
  bottomBlurAmount: number
  rotationX: number
  rotationY: number
  rotationZ: number
}

export type XhsCoverElement = XhsCoverTextElement | XhsCoverImageElement

export interface XhsCoverDocument {
  version: 1
  width: typeof XHS_COVER_WIDTH
  height: typeof XHS_COVER_HEIGHT
  backgroundColor?: string
  templateId?: XhsCoverTemplateId
  elements: XhsCoverElement[]
}

function createElementId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

function cleanMarkdownText(value: string) {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractCoverText(markdown: string) {
  const lines = markdown.split(/\r?\n/)
  const h1 = lines.find(line => /^#\s+/.test(line))
  const h2 = lines.find(line => /^##\s+/.test(line))
  const title = cleanMarkdownText((h1 ?? h2 ?? '').replace(/^#{1,2}\s+/, '')) || '项目名'
  const subtitle = lines
    .map(line => line.trim())
    .filter(line => line && !/^#{1,6}\s+/.test(line) && !/^[-*+]\s+/.test(line))
    .map(cleanMarkdownText)
    .find(Boolean) ?? ''

  return { title, subtitle }
}

interface CoverTextOptions {
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  text: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  color?: string
  highlightColor?: string
  textStrokeColor?: string
  textStrokeWidth?: number
  textShadowColor?: string
  textShadowOffsetX?: number
  textShadowOffsetY?: number
  textShadowBlur?: number
  textAlign?: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'middle' | 'bottom'
  lineHeight?: number
  backgroundColor?: string
  borderColor?: string
  borderWidth?: number
  borderRadius?: number
}

function createTextElement(idPrefix: string, options: CoverTextOptions): XhsCoverTextElement {
  return {
    id: createElementId(idPrefix),
    type: 'text',
    x: options.x,
    y: options.y,
    width: options.width,
    height: options.height,
    zIndex: options.zIndex,
    text: options.text,
    fontFamily: options.fontFamily ?? 'OPPO Sans',
    fontSize: options.fontSize ?? 48,
    fontWeight: options.fontWeight ?? 400,
    color: options.color ?? '#111111',
    highlightColor: options.highlightColor ?? 'transparent',
    textStrokeColor: options.textStrokeColor ?? '#ffffff',
    textStrokeWidth: options.textStrokeWidth ?? 0,
    textShadowColor: options.textShadowColor ?? 'transparent',
    textShadowOffsetX: options.textShadowOffsetX ?? 0,
    textShadowOffsetY: options.textShadowOffsetY ?? 0,
    textShadowBlur: options.textShadowBlur ?? 0,
    textAlign: options.textAlign ?? 'left',
    verticalAlign: options.verticalAlign ?? 'middle',
    lineHeight: options.lineHeight ?? 1.2,
    backgroundColor: options.backgroundColor ?? 'transparent',
    borderColor: options.borderColor ?? '#111111',
    borderWidth: options.borderWidth ?? 0,
    borderRadius: options.borderRadius ?? 0,
  }
}

function createSvgDataUrl(svg: string) {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function createSvgImageElement(
  idPrefix: string,
  x: number,
  y: number,
  width: number,
  height: number,
  svg: string,
  alt: string,
  zIndex: number,
): XhsCoverImageElement {
  return {
    id: createElementId(idPrefix),
    type: 'image',
    x,
    y,
    width,
    height,
    zIndex,
    src: createSvgDataUrl(svg),
    aspectRatio: width / height,
    alt,
    ...XHS_DEFAULT_IMAGE_STYLE,
  }
}

function createBlueprintCoverDocument(title: string): XhsCoverDocument {
  const logo = createSvgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180">
      <path fill="#050505" d="M0 0h96v48H48v48H0V0Zm0 48h48v132H0V48Zm96 48h48v84H96V96Z"/>
    </svg>
  `)

  return {
    version: 1,
    width: XHS_COVER_WIDTH,
    height: XHS_COVER_HEIGHT,
    backgroundColor: '#ffffff',
    templateId: 'blueprint',
    elements: [
      createTextElement('title', {
        x: 170,
        y: 185,
        width: 380,
        height: 130,
        zIndex: 1,
        text: title,
        fontSize: 120,
        fontWeight: 700,
        color: '#111111',
        textStrokeColor: '#ffffff',
        textShadowColor: XHS_DEFAULT_TEXT_SHADOW.color,
        textShadowOffsetX: XHS_DEFAULT_TEXT_SHADOW.offsetX,
        textShadowOffsetY: XHS_DEFAULT_TEXT_SHADOW.offsetY,
        textShadowBlur: XHS_DEFAULT_TEXT_SHADOW.blur,
        textAlign: 'center',
        verticalAlign: 'middle',
        lineHeight: 1.15,
      }),
      {
        id: createElementId('logo'),
        type: 'image',
        x: 270,
        y: 385,
        width: 180,
        height: 180,
        zIndex: 2,
        src: logo,
        aspectRatio: 1,
        alt: '品牌标志',
        ...XHS_DEFAULT_IMAGE_STYLE,
      },
      createTextElement('tagline', {
        x: 150,
        y: 680,
        width: 420,
        height: 76,
        zIndex: 3,
        text: '每天拆解一个AI项目  ⇢',
        fontSize: 35,
        fontWeight: 400,
        color: '#ffffff',
        textStrokeColor: '#ffffff',
        textShadowColor: XHS_DEFAULT_TEXT_SHADOW.color,
        textShadowOffsetX: XHS_DEFAULT_TEXT_SHADOW.offsetX,
        textShadowOffsetY: XHS_DEFAULT_TEXT_SHADOW.offsetY,
        textShadowBlur: XHS_DEFAULT_TEXT_SHADOW.blur,
        textAlign: 'center',
        verticalAlign: 'middle',
        lineHeight: 1.2,
        backgroundColor: '#2854e8',
        borderColor: '#2854e8',
        borderRadius: 38,
      }),
    ],
  }
}

function createEditorialCoverDocument(title: string): XhsCoverDocument {
  const projectCards = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 460">
    <defs>
      <filter id="card-shadow" x="-20%" y="-20%" width="140%" height="160%">
        <feDropShadow dx="0" dy="10" stdDeviation="8" flood-color="#1d2835" flood-opacity=".14"/>
      </filter>
      <clipPath id="card-crop">
        <rect width="720" height="460"/>
      </clipPath>
    </defs>
    <g clip-path="url(#card-crop)">
      <path d="M0 414h720v46H0z" fill="#ececea"/>

      <g transform="translate(24 116) rotate(-19 130 150)" filter="url(#card-shadow)">
        <rect x="10" y="14" width="260" height="302" rx="28" fill="#c84c30"/>
        <rect width="260" height="302" rx="28" fill="#f15b35"/>
        <rect x="18" y="22" width="224" height="270" rx="18" fill="#f3c34f"/>
        <rect x="34" y="38" width="190" height="238" rx="14" fill="#ff7a4e"/>
        <path d="M48 60h162v180H48z" fill="#f6b94a" opacity=".55"/>
        <circle cx="90" cy="112" r="32" fill="#f8e5ab" opacity=".72"/>
        <circle cx="174" cy="194" r="52" fill="#d94932" opacity=".45"/>
        <path d="M42 252h176" stroke="#fff4cf" stroke-width="3" opacity=".8"/>
      </g>

      <g transform="translate(126 108) rotate(8 116 150)" filter="url(#card-shadow)">
        <rect x="8" y="12" width="232" height="312" rx="26" fill="#c4a941"/>
        <rect width="232" height="312" rx="26" fill="#f1d05a"/>
        <rect x="18" y="18" width="196" height="276" rx="18" fill="#fff7dc"/>
        <text x="34" y="54" fill="#8a825a" font-family="Arial, sans-serif" font-size="15">2024</text>
        <path d="M34 82h164M34 118h164M34 154h128M34 190h164M34 226h142" stroke="#cfc8a8" stroke-width="2" opacity=".7"/>
      </g>

      <g transform="translate(404 62) rotate(5 134 150)" filter="url(#card-shadow)">
        <rect x="8" y="12" width="268" height="300" rx="26" fill="#a89b94"/>
        <rect width="268" height="300" rx="26" fill="#c2b7b1"/>
        <rect x="18" y="18" width="232" height="264" rx="18" fill="#f4f1ec"/>
        <text x="34" y="52" fill="#9b918a" font-family="Arial, sans-serif" font-size="15">2025</text>
        <path d="M34 86h198M34 122h198M34 158h166M34 194h198M34 230h180" stroke="#d5d0ca" stroke-width="2" opacity=".75"/>
      </g>

      <g transform="translate(452 116) rotate(12 130 148)" filter="url(#card-shadow)">
        <rect x="8" y="12" width="260" height="296" rx="28" fill="#2385b9"/>
        <rect width="260" height="296" rx="28" fill="#39a8dc"/>
        <rect x="18" y="20" width="224" height="260" rx="18" fill="#4bb9e7" opacity=".72"/>
        <path d="M34 56h188M34 90h154M34 236h174" stroke="#e6f5fb" stroke-width="3" opacity=".75"/>
        <text x="34" y="132" fill="#eaf8ff" font-family="Arial, sans-serif" font-size="18" opacity=".85">2025</text>
      </g>

      <g transform="translate(250 12) rotate(-11 130 170)" filter="url(#card-shadow)">
        <rect x="8" y="12" width="258" height="330" rx="26" fill="#d7d8d6"/>
        <rect width="258" height="330" rx="26" fill="#fafaf7"/>
        <text x="30" y="48" fill="#202226" font-family="Arial, sans-serif" font-size="15" font-weight="700">PART PROJECTS</text>
        <path d="M30 72h184M30 108h184M30 144h154M30 180h184M30 216h164M30 252h184" stroke="#d4d5d1" stroke-width="2"/>
        <text x="30" y="96" fill="#85878a" font-family="Arial, sans-serif" font-size="11">品牌视觉</text>
        <text x="30" y="132" fill="#85878a" font-family="Arial, sans-serif" font-size="11">运营视觉</text>
        <text x="30" y="168" fill="#85878a" font-family="Arial, sans-serif" font-size="11">AIGC</text>
      </g>

      <g transform="translate(274 90) rotate(-7 122 164)" filter="url(#card-shadow)">
        <rect x="9" y="14" width="244" height="328" rx="28" fill="#302c9f"/>
        <rect width="244" height="328" rx="28" fill="#504fd8"/>
        <rect x="18" y="20" width="208" height="286" rx="22" fill="#5b5ae3" opacity=".76"/>
        <path d="M28 52h176M28 78h134" stroke="#aaaaf5" stroke-width="3" opacity=".65"/>
        <text x="28" y="220" fill="#e8e8ff" font-family="Arial, sans-serif" font-size="30" opacity=".35">2026</text>
        <path d="M28 268h176" stroke="#d8d8ff" stroke-width="3" opacity=".5"/>
      </g>
    </g>
  </svg>`

  return {
    version: 1,
    width: XHS_COVER_WIDTH,
    height: XHS_COVER_HEIGHT,
    backgroundColor: '#fbfbfa',
    templateId: 'editorial',
    elements: [
      createSvgImageElement(
        'editorial-cards',
        0,
        500,
        720,
        460,
        projectCards,
        '微3D项目卡片组',
        1,
      ),
      createTextElement('kicker', {
        x: 64,
        y: 48,
        width: 220,
        height: 28,
        zIndex: 2,
        text: 'AI PROJECT STUDIO',
        fontSize: 14,
        fontWeight: 500,
        color: '#272a2f',
        textShadowColor: '#e1e4e7',
        textShadowOffsetX: 1,
        textShadowOffsetY: 1,
        textShadowBlur: 0,
        lineHeight: 1.2,
      }),
      createTextElement('collection', {
        x: 258,
        y: 46,
        width: 204,
        height: 30,
        zIndex: 2,
        text: '2026 WORK COLLECTION',
        fontSize: 12,
        fontWeight: 500,
        color: '#a1a3a7',
        textShadowColor: '#ffffff',
        textShadowOffsetX: 1,
        textShadowOffsetY: 1,
        textShadowBlur: 0,
        textAlign: 'center',
        verticalAlign: 'middle',
        lineHeight: 1.2,
        backgroundColor: '#f0f0ee',
        borderRadius: 15,
      }),
      createSvgImageElement(
        'editorial-plus',
        664,
        48,
        32,
        32,
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M16 7v18M7 16h18" stroke="#202226" stroke-width="2" stroke-linecap="round"/></svg>',
        '加号标记',
        2,
      ),
      createTextElement('title', {
        x: 56,
        y: 136,
        width: 608,
        height: 160,
        zIndex: 3,
        text: title,
        fontFamily: 'OPPO Sans',
        fontSize: 110,
        fontWeight: 400,
        color: '#202226',
        textStrokeColor: '#fbfbfa',
        textStrokeWidth: 1,
        textShadowColor: '#d9e2e9',
        textShadowOffsetX: 3,
        textShadowOffsetY: 4,
        textShadowBlur: 0,
        textAlign: 'center',
        verticalAlign: 'middle',
        lineHeight: 1.02,
      }),
      createTextElement('subtitle', {
        x: 80,
        y: 320,
        width: 560,
        height: 62,
        zIndex: 3,
        text: '2025—2026 年度 AI 项目作品集',
        fontFamily: 'OPPO Sans',
        fontSize: 25,
        color: '#666a70',
        textStrokeColor: '#fbfbfa',
        textStrokeWidth: 1,
        textShadowColor: '#e1e6ea',
        textShadowOffsetX: 1,
        textShadowOffsetY: 2,
        textShadowBlur: 0,
        textAlign: 'center',
        verticalAlign: 'middle',
        lineHeight: 1.45,
      }),
    ],
  }
}

export function applyProjectNameToCoverDocument(
  document: XhsCoverDocument,
  markdown: string,
): XhsCoverDocument {
  const { title } = extractCoverText(markdown)
  const titleElement = document.elements.find(element => element.type === 'text' && element.id.startsWith('title-'))
    ?? document.elements.find(element => element.type === 'text')

  if (!titleElement) {
    return document
  }

  return updateCoverElement(document, titleElement.id, { text: title })
}

export function createDefaultCoverDocument(markdown: string): XhsCoverDocument {
  void markdown
  return createBlueprintCoverDocument('项目名')
}

function getCoverTitle(document?: XhsCoverDocument) {
  const titleElement = document?.elements.find(element => element.type === 'text' && element.id.startsWith('title-'))
    ?? document?.elements.find(element => element.type === 'text')
  const title = titleElement?.type === 'text' ? titleElement.text.trim() : ''
  return title || '项目名'
}

export function createCoverTemplateDocument(
  templateId: XhsCoverTemplateId,
  sourceDocument?: XhsCoverDocument,
): XhsCoverDocument {
  const title = getCoverTitle(sourceDocument)

  switch (templateId) {
    case 'blueprint':
      return createBlueprintCoverDocument(title)
    case 'editorial':
      return createEditorialCoverDocument(title)
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isBaseElement(value: Record<string, unknown>) {
  return typeof value.id === 'string'
    && isFiniteNumber(value.x)
    && isFiniteNumber(value.y)
    && isFiniteNumber(value.width)
    && isFiniteNumber(value.height)
    && isFiniteNumber(value.zIndex)
}

function parseElement(value: unknown): XhsCoverElement | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const element = value as Record<string, unknown>
  if (!isBaseElement(element)) {
    return null
  }

  if (
    element.type === 'text'
    && typeof element.text === 'string'
    && typeof element.fontFamily === 'string'
    && isFiniteNumber(element.fontSize)
    && isFiniteNumber(element.fontWeight)
    && typeof element.color === 'string'
    && ['left', 'center', 'right'].includes(String(element.textAlign))
    && isFiniteNumber(element.lineHeight)
  ) {
    return clampCoverElement({
      ...element,
      verticalAlign: ['top', 'middle', 'bottom'].includes(String(element.verticalAlign))
        ? element.verticalAlign
        : 'top',
      highlightColor: typeof element.highlightColor === 'string' ? element.highlightColor : 'transparent',
      textStrokeColor: typeof element.textStrokeColor === 'string' ? element.textStrokeColor : '#ffffff',
      textStrokeWidth: isFiniteNumber(element.textStrokeWidth)
        ? Math.min(24, Math.max(0, element.textStrokeWidth))
        : 0,
      textShadowColor: typeof element.textShadowColor === 'string'
        ? element.textShadowColor
        : XHS_DEFAULT_TEXT_SHADOW.color,
      textShadowOffsetX: isFiniteNumber(element.textShadowOffsetX)
        ? Math.min(60, Math.max(-60, element.textShadowOffsetX))
        : XHS_DEFAULT_TEXT_SHADOW.offsetX,
      textShadowOffsetY: isFiniteNumber(element.textShadowOffsetY)
        ? Math.min(60, Math.max(-60, element.textShadowOffsetY))
        : XHS_DEFAULT_TEXT_SHADOW.offsetY,
      textShadowBlur: isFiniteNumber(element.textShadowBlur)
        ? Math.min(60, Math.max(0, element.textShadowBlur))
        : XHS_DEFAULT_TEXT_SHADOW.blur,
      backgroundColor: typeof element.backgroundColor === 'string' ? element.backgroundColor : 'transparent',
      borderColor: typeof element.borderColor === 'string' ? element.borderColor : '#111111',
      borderWidth: isFiniteNumber(element.borderWidth) ? element.borderWidth : 0,
      borderRadius: isFiniteNumber(element.borderRadius) ? element.borderRadius : 0,
    } as unknown as XhsCoverTextElement)
  }

  if (
    element.type === 'image'
    && typeof element.src === 'string'
    && isFiniteNumber(element.aspectRatio)
    && element.aspectRatio > 0
    && typeof element.alt === 'string'
  ) {
    return clampCoverElement({
      ...element,
      borderRadius: isFiniteNumber(element.borderRadius)
        ? Math.min(360, Math.max(0, element.borderRadius))
        : XHS_DEFAULT_IMAGE_STYLE.borderRadius,
      shadowColor: typeof element.shadowColor === 'string'
        ? element.shadowColor
        : XHS_DEFAULT_IMAGE_STYLE.shadowColor,
      shadowOpacity: isFiniteNumber(element.shadowOpacity)
        ? Math.min(1, Math.max(0, element.shadowOpacity))
        : XHS_DEFAULT_IMAGE_STYLE.shadowOpacity,
      shadowOffsetX: isFiniteNumber(element.shadowOffsetX)
        ? Math.min(60, Math.max(-60, element.shadowOffsetX))
        : XHS_DEFAULT_IMAGE_STYLE.shadowOffsetX,
      shadowOffsetY: isFiniteNumber(element.shadowOffsetY)
        ? Math.min(60, Math.max(-60, element.shadowOffsetY))
        : XHS_DEFAULT_IMAGE_STYLE.shadowOffsetY,
      shadowBlur: isFiniteNumber(element.shadowBlur)
        ? Math.min(80, Math.max(0, element.shadowBlur))
        : XHS_DEFAULT_IMAGE_STYLE.shadowBlur,
      bottomBlurEnabled: typeof element.bottomBlurEnabled === 'boolean'
        ? element.bottomBlurEnabled
        : XHS_DEFAULT_IMAGE_STYLE.bottomBlurEnabled,
      bottomBlurHeight: isFiniteNumber(element.bottomBlurHeight)
        ? Math.min(80, Math.max(10, element.bottomBlurHeight))
        : XHS_DEFAULT_IMAGE_STYLE.bottomBlurHeight,
      bottomBlurAmount: isFiniteNumber(element.bottomBlurAmount)
        ? Math.min(40, Math.max(0, element.bottomBlurAmount))
        : XHS_DEFAULT_IMAGE_STYLE.bottomBlurAmount,
      rotationX: isFiniteNumber(element.rotationX)
        ? Math.min(180, Math.max(-180, element.rotationX))
        : XHS_DEFAULT_IMAGE_STYLE.rotationX,
      rotationY: isFiniteNumber(element.rotationY)
        ? Math.min(180, Math.max(-180, element.rotationY))
        : XHS_DEFAULT_IMAGE_STYLE.rotationY,
      rotationZ: isFiniteNumber(element.rotationZ)
        ? Math.min(180, Math.max(-180, element.rotationZ))
        : XHS_DEFAULT_IMAGE_STYLE.rotationZ,
    } as unknown as XhsCoverImageElement)
  }

  return null
}

function isCoverTemplateId(value: unknown): value is XhsCoverTemplateId {
  return XHS_COVER_TEMPLATES.some(template => template.id === value)
}

export function parseCoverDocument(value: unknown): XhsCoverDocument | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const document = value as Record<string, unknown>
  if (
    document.version !== 1
    || document.width !== XHS_COVER_WIDTH
    || document.height !== XHS_COVER_HEIGHT
    || !Array.isArray(document.elements)
  ) {
    return null
  }

  const elements = document.elements.map(parseElement)
  if (elements.includes(null)) {
    return null
  }

  return {
    version: 1,
    width: XHS_COVER_WIDTH,
    height: XHS_COVER_HEIGHT,
    backgroundColor: typeof document.backgroundColor === 'string' ? document.backgroundColor : '#ffffff',
    ...(isCoverTemplateId(document.templateId) ? { templateId: document.templateId } : {}),
    elements: elements as XhsCoverElement[],
  }
}

export function clampCoverElement<T extends XhsCoverElement>(element: T): T {
  let width = Math.min(Math.max(24, element.width), XHS_COVER_WIDTH)
  let height = Math.min(Math.max(24, element.height), XHS_COVER_HEIGHT)

  if (element.type === 'image') {
    if (width / height > element.aspectRatio) {
      width = height * element.aspectRatio
    }
    else {
      height = width / element.aspectRatio
    }

    return {
      ...element,
      width,
      height,
      x: Math.min(Math.max(-width, element.x), XHS_COVER_WIDTH),
      y: Math.min(Math.max(-height, element.y), XHS_COVER_HEIGHT),
      borderRadius: Math.min(Math.min(width, height) / 2, Math.max(0, element.borderRadius)),
    } as T
  }

  return {
    ...element,
    width,
    height,
    x: Math.min(Math.max(0, element.x), XHS_COVER_WIDTH - width),
    y: Math.min(Math.max(0, element.y), XHS_COVER_HEIGHT - height),
  }
}

export function updateCoverElement(
  document: XhsCoverDocument,
  id: string,
  patch: Partial<XhsCoverElement>,
): XhsCoverDocument {
  return {
    ...document,
    elements: document.elements.map(element => element.id === id
      ? clampCoverElement({ ...element, ...patch } as XhsCoverElement)
      : element),
  }
}

export function removeCoverElement(document: XhsCoverDocument, id: string): XhsCoverDocument {
  return { ...document, elements: document.elements.filter(element => element.id !== id) }
}

export function moveCoverElement(
  document: XhsCoverDocument,
  id: string,
  direction: 'forward' | 'backward',
): XhsCoverDocument {
  const sorted = [...document.elements].sort((a, b) => a.zIndex - b.zIndex)
  const index = sorted.findIndex(element => element.id === id)
  const targetIndex = direction === 'forward' ? index + 1 : index - 1
  if (index < 0 || targetIndex < 0 || targetIndex >= sorted.length) {
    return document
  }

  const current = sorted[index]
  const target = sorted[targetIndex]
  if (!current || !target) {
    return document
  }

  return {
    ...document,
    elements: document.elements.map((element) => {
      if (element.id === current.id) {
        return { ...element, zIndex: target.zIndex }
      }
      if (element.id === target.id) {
        return { ...element, zIndex: current.zIndex }
      }
      return element
    }),
  }
}
