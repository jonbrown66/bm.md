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
