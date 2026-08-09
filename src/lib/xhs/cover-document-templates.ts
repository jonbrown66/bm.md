import type {
  XhsCoverDocument,
  XhsCoverImageElement,
  XhsCoverTextElement,
} from '@/lib/xhs/cover-document-types'
import {
  XHS_COVER_HEIGHT,
  XHS_COVER_WIDTH,
  XHS_DEFAULT_IMAGE_STYLE,
  XHS_DEFAULT_TEXT_SHADOW,
} from '@/lib/xhs/cover-document-types'

function createElementId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
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

export function createBlueprintCoverDocument(title: string): XhsCoverDocument {
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

export function createEditorialCoverDocument(title: string): XhsCoverDocument {
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
