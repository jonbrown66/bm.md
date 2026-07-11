export const XHS_COVER_WIDTH = 720 as const
export const XHS_COVER_HEIGHT = 960 as const

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
}

export type XhsCoverElement = XhsCoverTextElement | XhsCoverImageElement

export interface XhsCoverDocument {
  version: 1
  width: typeof XHS_COVER_WIDTH
  height: typeof XHS_COVER_HEIGHT
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
  const title = cleanMarkdownText((h1 ?? h2 ?? '').replace(/^#{1,2}\s+/, '')) || '未命名文章'
  const subtitle = lines
    .map(line => line.trim())
    .filter(line => line && !/^#{1,6}\s+/.test(line) && !/^[-*+]\s+/.test(line))
    .map(cleanMarkdownText)
    .find(Boolean) ?? ''

  return { title, subtitle }
}

export function createDefaultCoverDocument(markdown: string): XhsCoverDocument {
  const { title, subtitle } = extractCoverText(markdown)
  const elements: XhsCoverElement[] = [
    {
      id: createElementId('title'),
      type: 'text',
      x: 70,
      y: 300,
      width: 580,
      height: 150,
      zIndex: 1,
      text: title,
      fontFamily: 'OPPO Sans',
      fontSize: 72,
      fontWeight: 700,
      color: '#111111',
      textAlign: 'center',
      verticalAlign: 'middle',
      lineHeight: 1.15,
      backgroundColor: 'transparent',
      borderColor: '#111111',
      borderWidth: 0,
      borderRadius: 0,
    },
  ]

  if (subtitle) {
    elements.push({
      id: createElementId('subtitle'),
      type: 'text',
      x: 110,
      y: 490,
      width: 500,
      height: 100,
      zIndex: 2,
      text: subtitle,
      fontFamily: 'OPPO Sans',
      fontSize: 30,
      fontWeight: 300,
      color: '#555555',
      textAlign: 'center',
      verticalAlign: 'middle',
      lineHeight: 1.5,
      backgroundColor: 'transparent',
      borderColor: '#555555',
      borderWidth: 0,
      borderRadius: 0,
    })
  }

  return { version: 1, width: XHS_COVER_WIDTH, height: XHS_COVER_HEIGHT, elements }
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
    return clampCoverElement(element as unknown as XhsCoverImageElement)
  }

  return null
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
