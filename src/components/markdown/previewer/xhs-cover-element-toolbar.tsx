import type { XhsCoverElement } from '@/lib/xhs/cover-document'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { XhsCoverImageToolbar } from './xhs-cover-image-toolbar'
import { XhsCoverTextToolbar } from './xhs-cover-text-toolbar'

interface XhsCoverElementToolbarProps {
  element: XhsCoverElement
  canvasScale?: number
  placement?: 'attached' | 'dock'
  onUpdate: (patch: Partial<XhsCoverElement>) => void
  onDelete: () => void
}

export function XhsCoverElementToolbar({
  element,
  canvasScale = 1,
  placement = 'attached',
  onUpdate,
  onDelete,
}: XhsCoverElementToolbarProps) {
  const placeToolbarBelow = element.y < 280
  const isDocked = placement === 'dock'

  return (
    <div
      className={isDocked
        ? `
          relative flex w-full max-w-[680px] flex-wrap items-center gap-1.5
          rounded-lg border border-black/15 bg-white p-1.5 text-black shadow-sm
        `
        : `
          absolute left-0 z-50 flex max-w-[680px] flex-wrap items-center gap-1.5
          rounded-lg border border-black/15 bg-white p-1.5 text-black shadow-lg
          ${placeToolbarBelow ? 'top-full mt-3' : 'bottom-full mb-3'}
        `}
      style={isDocked
        ? undefined
        : {
            transform: `scale(${Math.min(1.25, 1 / canvasScale)})`,
            transformOrigin: placeToolbarBelow ? 'top left' : 'bottom left',
          }}
      onPointerDown={event => event.stopPropagation()}
      onKeyDown={event => event.stopPropagation()}
    >
      {element.type === 'text' && (
        <XhsCoverTextToolbar
          element={element}
          onUpdate={patch => onUpdate(patch)}
        />
      )}
      {element.type === 'image' && (
        <XhsCoverImageToolbar
          element={element}
          onUpdate={patch => onUpdate(patch)}
        />
      )}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={`
          size-8 bg-white text-red-600
          hover:bg-red-50 hover:text-red-700
        `}
        onClick={onDelete}
        aria-label="删除封面元素"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  )
}
