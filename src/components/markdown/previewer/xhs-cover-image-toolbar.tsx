import type { ChangeEvent } from 'react'
import type { XhsCoverImageElement } from '@/lib/xhs/cover-document'
import { ImageUp } from 'lucide-react'
import { useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { XHS_DEFAULT_IMAGE_STYLE } from '@/lib/xhs/cover-document'
import { clampNumberInput, getToggleButtonClass } from './xhs-cover-toolbar-utils'

interface XhsCoverImageToolbarProps {
  element: XhsCoverImageElement
  onUpdate: (patch: Partial<XhsCoverImageElement>) => void
}

export function XhsCoverImageToolbar({ element, onUpdate }: XhsCoverImageToolbarProps) {
  const replacementInputRef = useRef<HTMLInputElement>(null)

  const replaceImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || element.type !== 'image') {
      return
    }
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'].includes(file.type)) {
      toast.error('请选择 PNG、JPG、WebP、GIF 或 SVG 图片')
      return
    }

    const reader = new FileReader()
    reader.addEventListener('load', () => {
      const src = String(reader.result)
      const image = new Image()
      image.addEventListener('load', () => {
        onUpdate({
          src,
          aspectRatio: image.naturalWidth / image.naturalHeight,
          alt: file.name,
        } as Partial<XhsCoverImageElement>)
      }, { once: true })
      image.addEventListener('error', () => toast.error('图片读取失败，请更换图片后重试'), { once: true })
      image.src = src
    }, { once: true })
    reader.addEventListener('error', () => toast.error('图片读取失败，请更换图片后重试'), { once: true })
    reader.readAsDataURL(file)
  }

  return (
    <>
      <label className={`
        flex h-8 items-center gap-1 rounded-md border border-black/15 bg-white
        px-2 text-xs text-black
      `}
      >
        <span className="text-[11px] whitespace-nowrap text-black/60">圆角</span>
        <Input
          type="number"
          min={0}
          max={360}
          value={element.borderRadius}
          onChange={event => onUpdate({
            borderRadius: clampNumberInput(event.target.value, 0, 360, element.borderRadius),
          })}
          className={`
            h-6 w-12 border-0 bg-transparent px-0 text-xs text-black shadow-none
            focus-visible:ring-0
          `}
          aria-label="图片圆角"
          title="圆角像素值"
        />
      </label>
      <span className="text-[11px] text-black/60">旋转</span>
      <label className={`
        flex h-8 items-center gap-1 rounded-md border border-black/15 bg-white
        px-2 text-xs text-black
      `}
      >
        <span className="text-[11px] text-black/60">X</span>
        <Input
          type="number"
          min={-180}
          max={180}
          value={element.rotationX}
          onChange={event => onUpdate({
            rotationX: clampNumberInput(event.target.value, -180, 180, element.rotationX),
          })}
          className={`
            h-6 w-10 border-0 bg-transparent px-0 text-xs text-black shadow-none
            focus-visible:ring-0
          `}
          aria-label="图片 X 轴旋转"
          title="X 轴旋转角度"
        />
        <span className="text-[11px] text-black/45">°</span>
      </label>
      <label className={`
        flex h-8 items-center gap-1 rounded-md border border-black/15 bg-white
        px-2 text-xs text-black
      `}
      >
        <span className="text-[11px] text-black/60">Y</span>
        <Input
          type="number"
          min={-180}
          max={180}
          value={element.rotationY}
          onChange={event => onUpdate({
            rotationY: clampNumberInput(event.target.value, -180, 180, element.rotationY),
          })}
          className={`
            h-6 w-10 border-0 bg-transparent px-0 text-xs text-black shadow-none
            focus-visible:ring-0
          `}
          aria-label="图片 Y 轴旋转"
          title="Y 轴旋转角度"
        />
        <span className="text-[11px] text-black/45">°</span>
      </label>
      <label className={`
        flex h-8 items-center gap-1 rounded-md border border-black/15 bg-white
        px-2 text-xs text-black
      `}
      >
        <span className="text-[11px] text-black/60">Z</span>
        <Input
          type="number"
          min={-180}
          max={180}
          value={element.rotationZ}
          onChange={event => onUpdate({
            rotationZ: clampNumberInput(event.target.value, -180, 180, element.rotationZ),
          })}
          className={`
            h-6 w-10 border-0 bg-transparent px-0 text-xs text-black shadow-none
            focus-visible:ring-0
          `}
          aria-label="图片 Z 轴旋转"
          title="Z 轴旋转角度"
        />
        <span className="text-[11px] text-black/45">°</span>
      </label>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={cn(
          getToggleButtonClass(element.shadowOpacity > 0),
          'text-xs',
        )}
        onClick={() => onUpdate({
          shadowOpacity: element.shadowOpacity > 0
            ? 0
            : 0.22,
        })}
        aria-label="切换图片阴影"
        title="图片阴影"
        aria-pressed={element.shadowOpacity > 0}
      >
        阴影
      </Button>
      <input
        type="color"
        value={/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(element.shadowColor)
          ? element.shadowColor
          : XHS_DEFAULT_IMAGE_STYLE.shadowColor}
        onChange={event => onUpdate({
          shadowColor: event.target.value,
          shadowOpacity: Math.max(0.22, element.shadowOpacity),
        })}
        className={`
          size-8 cursor-pointer rounded-md border border-black/15 bg-white p-1
        `}
        aria-label="图片阴影颜色"
        title="阴影颜色"
      />
      <Input
        type="number"
        min={0}
        max={1}
        step={0.05}
        value={element.shadowOpacity}
        onChange={event => onUpdate({
          shadowOpacity: clampNumberInput(event.target.value, 0, 1, element.shadowOpacity),
        })}
        className="h-8 w-16 border-black/15 bg-white px-2 text-xs text-black"
        aria-label="图片阴影透明度"
        title="阴影透明度"
      />
      <Input
        type="number"
        min={0}
        max={80}
        value={element.shadowBlur}
        onChange={event => onUpdate({
          shadowBlur: clampNumberInput(event.target.value, 0, 80, element.shadowBlur),
        })}
        className="h-8 w-16 border-black/15 bg-white px-2 text-xs text-black"
        aria-label="图片阴影模糊"
        title="阴影模糊"
      />
      <Input
        type="number"
        min={-60}
        max={60}
        value={element.shadowOffsetY}
        onChange={event => onUpdate({
          shadowOffsetY: clampNumberInput(event.target.value, -60, 60, element.shadowOffsetY),
        })}
        className="h-8 w-16 border-black/15 bg-white px-2 text-xs text-black"
        aria-label="图片阴影纵向偏移"
        title="阴影 Y"
      />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={cn(
          getToggleButtonClass(element.bottomBlurEnabled),
          'text-xs',
        )}
        onClick={() => onUpdate({ bottomBlurEnabled: !element.bottomBlurEnabled })}
        aria-label="切换图片底部模糊渐变"
        title="底部模糊渐变"
        aria-pressed={element.bottomBlurEnabled}
      >
        底部模糊
      </Button>
      <Input
        type="number"
        min={10}
        max={80}
        value={element.bottomBlurHeight}
        onChange={event => onUpdate({
          bottomBlurHeight: clampNumberInput(event.target.value, 10, 80, element.bottomBlurHeight),
        })}
        className="h-8 w-16 border-black/15 bg-white px-2 text-xs text-black"
        aria-label="图片底部模糊渐变高度"
        title="渐变高度"
      />
      <Input
        type="number"
        min={0}
        max={40}
        value={element.bottomBlurAmount}
        onChange={event => onUpdate({
          bottomBlurAmount: clampNumberInput(event.target.value, 0, 40, element.bottomBlurAmount),
        })}
        className="h-8 w-16 border-black/15 bg-white px-2 text-xs text-black"
        aria-label="图片底部模糊程度"
        title="模糊程度"
      />
      <input
        ref={replacementInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg"
        className="hidden"
        onChange={replaceImage}
      />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={`
          size-8 bg-white text-black
          hover:bg-neutral-100 hover:text-black
        `}
        onClick={() => replacementInputRef.current?.click()}
        aria-label="替换封面图片"
        title="替换图片"
      >
        <ImageUp className="size-3.5" />
      </Button>
    </>
  )
}
