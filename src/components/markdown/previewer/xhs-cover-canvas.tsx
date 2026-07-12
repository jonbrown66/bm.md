import type { PointerEvent as ReactPointerEvent } from 'react'
import type { XhsCoverDocument, XhsCoverElement } from '@/lib/xhs/cover-document'
import { useRef, useState } from 'react'
import { clampCoverElement, removeCoverElement, updateCoverElement } from '@/lib/xhs/cover-document'
import { XhsCoverElementToolbar } from './xhs-cover-element-toolbar'

type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se'

interface XhsCoverCanvasProps {
  document: XhsCoverDocument
  editable?: boolean
  scale?: number
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

export function XhsCoverCanvas({
  document,
  editable = false,
  scale = 1,
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
      style={{ width: document.width, height: document.height }}
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
                        <span className="w-full">{element.text}</span>
                      </div>
                    )
                : (
                    <img
                      src={element.src}
                      alt={element.alt}
                      draggable={false}
                      className="size-full object-contain select-none"
                      style={{
                        pointerEvents: editable ? 'none' : undefined,
                      }}
                    />
                  )}

              {selected && (
                <>
                  <XhsCoverElementToolbar
                    element={element}
                    canvasScale={scale}
                    onUpdate={patch => updateElement(element, patch)}
                    onDelete={() => deleteElement(element)}
                  />
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
