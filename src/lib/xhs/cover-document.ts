import type {
  XhsCoverDocument,
  XhsCoverElement,
  XhsCoverImageElement,
  XhsCoverTemplateId,
  XhsCoverTextElement,
} from '@/lib/xhs/cover-document-types'
import {
  createBlueprintCoverDocument,
  createEditorialCoverDocument,
} from '@/lib/xhs/cover-document-templates'
import {
  XHS_COVER_HEIGHT,
  XHS_COVER_TEMPLATES,
  XHS_COVER_WIDTH,
  XHS_DEFAULT_IMAGE_STYLE,
  XHS_DEFAULT_TEXT_SHADOW,
} from '@/lib/xhs/cover-document-types'
import { getCoverImageTransformOffset } from '@/lib/xhs/cover-transform'

export {
  XHS_COVER_HEIGHT,
  XHS_COVER_TEMPLATES,
  XHS_COVER_WIDTH,
  XHS_DEFAULT_IMAGE_STYLE,
  XHS_DEFAULT_TEXT_SHADOW,
} from '@/lib/xhs/cover-document-types'
export type {
  XhsCoverDocument,
  XhsCoverElement,
  XhsCoverImageElement,
  XhsCoverTemplateId,
  XhsCoverTemplateMeta,
  XhsCoverTextElement,
} from '@/lib/xhs/cover-document-types'

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

    const x = Math.min(Math.max(-width, element.x), XHS_COVER_WIDTH)
    const y = Math.min(Math.max(-height, element.y), XHS_COVER_HEIGHT)
    const nextElement: XhsCoverImageElement = {
      ...element,
      width,
      height,
      x,
      y,
    }
    const transformOffset = getCoverImageTransformOffset(
      nextElement,
      XHS_COVER_WIDTH,
      XHS_COVER_HEIGHT,
    )

    return {
      ...nextElement,
      width,
      height,
      x: Math.min(Math.max(-width, x + transformOffset.x), XHS_COVER_WIDTH),
      y: Math.min(Math.max(-height, y + transformOffset.y), XHS_COVER_HEIGHT),
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
