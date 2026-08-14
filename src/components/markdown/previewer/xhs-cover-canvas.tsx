import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import type { XhsCoverDocument, XhsCoverElement, XhsCoverImageElement, XhsCoverTextElement } from '@/lib/xhs/cover-document'
import { useRef, useState } from 'react'
import { clampCoverElement, removeCoverElement, updateCoverElement } from '@/lib/xhs/cover-document'
import { XHS_IMAGE_PERSPECTIVE } from '@/lib/xhs/cover-transform'
import { XhsCoverElementToolbar } from './xhs-cover-element-toolbar'

type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se'

interface XhsCoverCanvasProps {
  document: XhsCoverDocument
  editable?: boolean
  scale?: number
  showElementToolbar?: boolean
  selectedElementId?: string | null
  onSelectedElementIdChange?: (id: string | null) => void
  onDocumentChange?: (document: XhsCoverDocument, commit: boolean) => void
}

interface PointerInteraction {
  pointerId: number
  startClientX: number
  startClientY: number
  startElement: XhsCoverElement
  corner?: ResizeCorner
  latestDocument: XhsCoverDocument
}

const RESIZE_CORNERS: ResizeCorner[] = ['nw', 'ne', 'sw', 'se']

function getTextStroke(element: XhsCoverTextElement) {
  return element.textStrokeWidth > 0
    ? `${element.textStrokeWidth}px ${element.textStrokeColor}`
    : '0px transparent'
}

function getTextShadow(element: XhsCoverTextElement) {
  return element.textShadowColor === 'transparent'
    ? 'none'
    : `${element.textShadowOffsetX}px ${element.textShadowOffsetY}px ${element.textShadowBlur}px ${element.textShadowColor}`
}

function getTextEffectStyle(element: XhsCoverTextElement) {
  return {
    WebkitTextStroke: getTextStroke(element),
    paintOrder: 'stroke fill' as const,
    textShadow: getTextShadow(element),
  }
}

function getScribbleHighlightStyle(element: XhsCoverTextElement) {
  if (element.highlightColor === 'transparent') {
    return {
      backgroundImage: 'none',
      padding: 0,
    }
  }

  const highlightColor = /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(element.highlightColor)
    ? element.highlightColor
    : '#fff1a8'
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 48" preserveAspectRatio="none">
      <path fill="${highlightColor}" fill-opacity=".62" d="M-2 13 C9 8 17 14 28 10 S48 13 59 9 S83 13 102 7 L102 35 C88 39 75 32 62 37 S38 33 24 40 C14 36 5 42 -2 37 Z"/>
      <path fill="${highlightColor}" fill-opacity=".28" d="M-3 19 C9 14 20 20 32 16 S52 19 67 15 S87 19 103 13 L103 42 C89 45 74 38 59 44 S38 39 24 45 C14 42 5 47 -3 43 Z"/>
      <path fill="${highlightColor}" fill-opacity=".16" d="M-1 7 C12 4 22 9 35 6 S54 9 68 5 S87 9 101 4 L101 28 C87 31 74 25 61 30 S38 26 24 33 C13 29 6 34 -1 30 Z"/>
    </svg>
  `

  return {
    backgroundColor: 'transparent',
    backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    backgroundSize: '100% 100%',
    boxDecorationBreak: 'clone' as const,
    WebkitBoxDecorationBreak: 'clone' as const,
    padding: '0.12em 0.2em',
  }
}

function colorToRgba(color: string, opacity: number) {
  const alpha = Math.min(1, Math.max(0, opacity))
  const normalized = color.trim()
  const hex = normalized.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1]

  if (hex) {
    const expanded = hex.length === 3
      ? hex.split('').map(value => `${value}${value}`).join('')
      : hex
    const red = Number.parseInt(expanded.slice(0, 2), 16)
    const green = Number.parseInt(expanded.slice(2, 4), 16)
    const blue = Number.parseInt(expanded.slice(4, 6), 16)
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`
  }

  const rgb = normalized.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i)
  if (rgb) {
    return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`
  }

  return `rgba(255, 255, 255, ${alpha})`
}

function getImageShadow(element: XhsCoverImageElement) {
  if (element.shadowOpacity <= 0) {
    return 'none'
  }

  return `${element.shadowOffsetX}px ${element.shadowOffsetY}px ${element.shadowBlur}px ${colorToRgba(element.shadowColor, element.shadowOpacity)}`
}

function getImageRotationTransform(element: XhsCoverImageElement) {
  if (element.rotationX === 0 && element.rotationY === 0 && element.rotationZ === 0) {
    return 'none'
  }

  return `perspective(${XHS_IMAGE_PERSPECTIVE}px) rotateX(${element.rotationX}deg) rotateY(${element.rotationY}deg) rotateZ(${element.rotationZ}deg)`
}

function getImageFrameStyle(element: XhsCoverImageElement): CSSProperties {
  return {
    borderRadius: element.borderRadius,
    boxShadow: getImageShadow(element),
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
    height: '100%',
    isolation: 'isolate',
    transform: getImageRotationTransform(element),
    transformOrigin: 'center center',
    transformStyle: 'preserve-3d',
  } as CSSProperties
}

export function XhsCoverCanvas({
  document,
  editable = false,
  scale = 1,
  showElementToolbar = true,
  selectedElementId = null,
  onSelectedElementIdChange,
  onDocumentChange,
}: XhsCoverCanvasProps) {
  const interactionRef = useRef<PointerInteraction | null>(null)
  const [editingElementId, setEditingElementId] = useState<string | null>(null)
  const [showVerticalCenterLine, setShowVerticalCenterLine] = useState(false)
  const [showHorizontalCenterLine, setShowHorizontalCenterLine] = useState(false)

  const emit = (nextDocument: XhsCoverDocument, commit: boolean) => {
    onDocumentChange?.(nextDocument, commit)
  }

  const startPointerInteraction = (
    event: ReactPointerEvent<HTMLElement>,
    element: XhsCoverElement,
    corner?: ResizeCorner,
  ) => {
    if (!editable || event.button !== 0 || editingElementId === element.id) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    onSelectedElementIdChange?.(element.id)
    interactionRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startElement: element,
      corner,
      latestDocument: document,
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current
    if (!interaction || interaction.pointerId !== event.pointerId) {
      return
    }

    const dx = (event.clientX - interaction.startClientX) / scale
    const dy = (event.clientY - interaction.startClientY) / scale
    const start = interaction.startElement
    let nextElement: XhsCoverElement

    if (!interaction.corner) {
      let targetX = start.x + dx
      let targetY = start.y + dy
      const width = start.width
      const height = start.height
      const centerX = targetX + width / 2
      const centerY = targetY + height / 2

      let snapX = false
      let snapY = false

      // 水平居中磁吸 (中线 360px，阈值 6px)
      if (Math.abs(centerX - 360) < 6) {
        targetX = 360 - width / 2
        snapX = true
      }

      // 垂直居中磁吸 (中线 480px，阈值 6px)
      if (Math.abs(centerY - 480) < 6) {
        targetY = 480 - height / 2
        snapY = true
      }

      setShowVerticalCenterLine(snapX)
      setShowHorizontalCenterLine(snapY)

      nextElement = clampCoverElement({ ...start, x: targetX, y: targetY })
    }
    else {
      const movesLeft = interaction.corner.includes('w')
      const movesTop = interaction.corner.includes('n')
      let width = Math.max(24, start.width + (movesLeft ? -dx : dx))
      let height = start.type === 'image'
        ? width / start.aspectRatio
        : Math.max(24, start.height + (movesTop ? -dy : dy))
      if (start.type === 'image' && height > 960) {
        height = 960
        width = height * start.aspectRatio
      }
      nextElement = clampCoverElement({
        ...start,
        width,
        height,
        x: movesLeft ? start.x + start.width - width : start.x,
        y: movesTop ? start.y + start.height - height : start.y,
      })
    }

    const nextDocument = updateCoverElement(document, start.id, nextElement)
    interaction.latestDocument = nextDocument
    emit(nextDocument, false)
  }

  const finishPointerInteraction = (event: ReactPointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current
    if (!interaction || interaction.pointerId !== event.pointerId) {
      return
    }

    interactionRef.current = null
    setShowVerticalCenterLine(false)
    setShowHorizontalCenterLine(false)
    emit(interaction.latestDocument, true)
  }

  const updateElement = (element: XhsCoverElement, patch: Partial<XhsCoverElement>) => {
    emit(updateCoverElement(document, element.id, patch), true)
  }

  const deleteElement = (element: XhsCoverElement) => {
    emit(removeCoverElement(document, element.id), true)
    onSelectedElementIdChange?.(null)
  }

  return (
    <div
      className={`
        relative shrink-0 bg-white text-black outline-none
        ${editable ? 'overflow-visible' : 'overflow-hidden'}
      `}
      style={{
        width: document.width,
        height: document.height,
        backgroundColor: document.backgroundColor ?? '#ffffff',
      }}
      tabIndex={editable ? 0 : undefined}
      onPointerDown={() => editable && onSelectedElementIdChange?.(null)}
      onKeyDown={(event) => {
        const target = event.target
        if (
          target instanceof HTMLInputElement
          || target instanceof HTMLTextAreaElement
          || target instanceof HTMLSelectElement
          || target instanceof HTMLButtonElement
          || (target instanceof HTMLElement && target.isContentEditable)
        ) {
          return
        }
        if (!editable || !selectedElementId) {
          return
        }
        const selected = document.elements.find(element => element.id === selectedElementId)
        if (!selected) {
          return
        }
        if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault()
          deleteElement(selected)
        }
        if (event.key === 'Escape') {
          onSelectedElementIdChange?.(null)
        }
        const offsets: Record<string, [number, number]> = {
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
        }
        const offset = offsets[event.key]
        if (offset) {
          event.preventDefault()
          updateElement(selected, { x: selected.x + offset[0], y: selected.y + offset[1] })
        }
      }}
    >
      {editable && (
        <div className="pointer-events-none absolute inset-0 z-40">
          {/* 垂直对齐辅助线 (当元素水平居中对齐时显示，亮蓝色虚线，带有渐变动画) */}
          <div
            className={`
              absolute top-0 bottom-0 left-1/2 border-l-2 border-dashed
              border-blue-500 transition-opacity duration-150
              ${showVerticalCenterLine ? 'opacity-100' : 'opacity-0'}
            `}
          />
          {/* 水平对齐辅助线 (当元素垂直居中对齐时显示) */}
          <div
            className={`
              absolute right-0 bottom-1/2 left-0 border-t-2 border-dashed
              border-blue-500 transition-opacity duration-150
              ${showHorizontalCenterLine ? 'opacity-100' : 'opacity-0'}
            `}
          />
        </div>
      )}
      {[...document.elements]
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((element) => {
          const selected = editable && selectedElementId === element.id
          return (
            <div
              key={element.id}
              className={selected ? 'absolute ring-2 ring-primary' : 'absolute'}
              style={{
                left: element.x,
                top: element.y,
                width: element.width,
                height: element.height,
                zIndex: selected ? 50 : Math.min(element.zIndex, 40),
              }}
              onPointerDown={event => startPointerInteraction(event, element)}
              onDoubleClick={(event) => {
                if (editable && element.type === 'text') {
                  event.preventDefault()
                  event.stopPropagation()
                  onSelectedElementIdChange?.(element.id)
                  setEditingElementId(element.id)
                }
              }}
              onPointerMove={handlePointerMove}
              onPointerUp={finishPointerInteraction}
              onPointerCancel={finishPointerInteraction}
            >
              {element.type === 'text'
                ? editingElementId === element.id
                  ? (
                      <textarea
                        autoFocus
                        defaultValue={element.text}
                        className={`
                          size-full resize-none overflow-hidden border-0
                          bg-transparent p-0 outline-none
                        `}
                        style={{
                          fontFamily: element.fontFamily,
                          fontSize: element.fontSize,
                          fontWeight: element.fontWeight,
                          color: element.color,
                          textAlign: element.textAlign,
                          lineHeight: element.lineHeight,
                          ...getTextEffectStyle(element),
                          backgroundColor: element.backgroundColor,
                          border: `${element.borderWidth}px solid ${element.borderColor}`,
                          borderRadius: element.borderRadius,
                        }}
                        onPointerDown={event => event.stopPropagation()}
                        onBlur={(event) => {
                          updateElement(element, { text: event.currentTarget.value })
                          setEditingElementId(null)
                        }}
                        onKeyDown={(event) => {
                          event.stopPropagation()
                          if (event.key === 'Escape' || ((event.ctrlKey || event.metaKey) && event.key === 'Enter')) {
                            event.currentTarget.blur()
                          }
                        }}
                      />
                    )
                  : (
                      <div
                        className={`
                          size-full break-words whitespace-pre-wrap outline-none
                        `}
                        style={{
                          fontFamily: element.fontFamily,
                          fontSize: element.fontSize,
                          fontWeight: element.fontWeight,
                          color: element.color,
                          textAlign: element.textAlign,
                          lineHeight: element.lineHeight,
                          display: 'flex',
                          alignItems: element.verticalAlign === 'middle'
                            ? 'center'
                            : element.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start',
                          backgroundColor: element.backgroundColor,
                          border: `${element.borderWidth}px solid ${element.borderColor}`,
                          borderRadius: element.borderRadius,
                        }}
                      >
                        <span className="block w-full">
                          <span
                            style={{
                              ...getTextEffectStyle(element),
                              ...getScribbleHighlightStyle(element),
                            }}
                          >
                            {element.text}
                          </span>
                        </span>
                      </div>
                    )
                : (
                    <div style={getImageFrameStyle(element)}>
                      <img
                        src={element.src}
                        alt={element.alt}
                        draggable={false}
                        className="size-full object-contain select-none"
                        style={{
                          pointerEvents: editable ? 'none' : undefined,
                        }}
                      />
                      {element.bottomBlurEnabled && (
                        <div
                          aria-hidden="true"
                          className={`
                            pointer-events-none absolute inset-x-0 bottom-0
                          `}
                          style={{
                            height: `${element.bottomBlurHeight}%`,
                            backdropFilter: `blur(${element.bottomBlurAmount}px)`,
                            WebkitBackdropFilter: `blur(${element.bottomBlurAmount}px)`,
                            background: `linear-gradient(to bottom, ${colorToRgba(document.backgroundColor ?? '#ffffff', 0)}, ${colorToRgba(document.backgroundColor ?? '#ffffff', 0.9)})`,
                            maskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0, 0, 0, 0.08) 28%, #000000 68%, #000000 100%)',
                            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0, 0, 0, 0.08) 28%, #000000 68%, #000000 100%)',
                          }}
                        />
                      )}
                    </div>
                  )}

              {selected && (
                <>
                  {showElementToolbar && editingElementId !== element.id && (
                    <XhsCoverElementToolbar
                      element={element}
                      canvasScale={scale}
                      onUpdate={patch => updateElement(element, patch)}
                      onDelete={() => deleteElement(element)}
                    />
                  )}
                  {RESIZE_CORNERS.map(corner => (
                    <button
                      key={corner}
                      type="button"
                      className={`
                        absolute size-4 rounded-full border-2 border-primary
                        bg-white
                        ${corner.includes('n') ? '-top-2' : '-bottom-2'}
                        ${corner.includes('w') ? '-left-2' : '-right-2'}
                      `}
                      style={{ cursor: `${corner}-resize` }}
                      onPointerDown={event => startPointerInteraction(event, element, corner)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={finishPointerInteraction}
                      onPointerCancel={finishPointerInteraction}
                      aria-label={`从${corner}方向缩放封面元素`}
                    />
                  ))}
                </>
              )}
            </div>
          )
        })}
    </div>
  )
}
