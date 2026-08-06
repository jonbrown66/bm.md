import type { ChangeEvent } from 'react'
import type { XhsCoverElement, XhsCoverTextElement } from '@/lib/xhs/cover-document'
import { AlignCenter, AlignLeft, AlignRight, Bold, ImageUp, Trash2 } from 'lucide-react'
import { useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { XHS_DEFAULT_TEXT_SHADOW } from '@/lib/xhs/cover-document'

interface XhsCoverElementToolbarProps {
  element: XhsCoverElement
  canvasScale?: number
  onUpdate: (patch: Partial<XhsCoverElement>) => void
  onDelete: () => void
}

function clampNumberInput(value: string, min: number, max: number, fallback: number) {
  const nextValue = Number(value)
  return Number.isFinite(nextValue)
    ? Math.min(max, Math.max(min, nextValue))
    : fallback
}

function getToggleButtonClass(active: boolean, icon = false) {
  return cn(
    icon ? 'size-8' : 'h-8 px-2',
    `
      bg-white text-black transition-none
      hover:bg-neutral-100 hover:text-black
    `,
    active && `
      border-blue-500 bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-200
      hover:bg-blue-100 hover:text-blue-800
    `,
  )
}

export function XhsCoverElementToolbar({
  element,
  canvasScale = 1,
  onUpdate,
  onDelete,
}: XhsCoverElementToolbarProps) {
  const textElement = element.type === 'text' ? element : null
  const replacementInputRef = useRef<HTMLInputElement>(null)
  const placeToolbarBelow = element.y < 280

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
        } as Partial<XhsCoverElement>)
      }, { once: true })
      image.addEventListener('error', () => toast.error('图片读取失败，请更换图片后重试'), { once: true })
      image.src = src
    }, { once: true })
    reader.addEventListener('error', () => toast.error('图片读取失败，请更换图片后重试'), { once: true })
    reader.readAsDataURL(file)
  }

  return (
    <div
      className={`
        absolute left-0 z-50 flex max-w-[680px] flex-wrap items-center gap-1.5
        rounded-lg border border-black/15 bg-white p-1.5 text-black shadow-lg
        ${placeToolbarBelow ? 'top-full mt-3' : 'bottom-full mb-3'}
      `}
      style={{ transform: `scale(${Math.min(1.25, 1 / canvasScale)})`, transformOrigin: 'bottom left' }}
      onPointerDown={event => event.stopPropagation()}
      onKeyDown={event => event.stopPropagation()}
    >
      {textElement && (
        <>
          <select
            value={textElement.fontFamily}
            onChange={event => onUpdate({ fontFamily: event.target.value } as Partial<XhsCoverTextElement>)}
            className={`
              h-8 rounded-md border border-black/15 bg-white px-2.5 text-xs
              text-black
            `}
            aria-label="封面文字字体"
          >
            <option value="OPPO Sans">OPPO Sans</option>
            <option value="Source Han Sans SC">思源黑体</option>
            <option value="Source Han Serif SC">思源宋体</option>
            <option value="sans-serif">系统黑体</option>
          </select>
          <Input
            type="number"
            min={12}
            max={180}
            value={textElement.fontSize}
            onChange={event => onUpdate({ fontSize: Number(event.target.value) } as Partial<XhsCoverTextElement>)}
            className={`
              h-8 w-16 border-black/15 bg-white px-2 text-xs text-black
            `}
            aria-label="封面文字字号"
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={getToggleButtonClass(textElement.fontWeight >= 700, true)}
            onClick={() => onUpdate({ fontWeight: textElement.fontWeight >= 700 ? 400 : 700 } as Partial<XhsCoverTextElement>)}
            aria-label="切换封面文字粗体"
            aria-pressed={textElement.fontWeight >= 700}
          >
            <Bold className="size-3.5" />
          </Button>
          {([
            ['left', AlignLeft, '文字左对齐'],
            ['center', AlignCenter, '文字居中'],
            ['right', AlignRight, '文字右对齐'],
          ] as const).map(([alignment, Icon, label]) => (
            <Button
              key={alignment}
              type="button"
              size="icon"
              variant="ghost"
              className={getToggleButtonClass(textElement.textAlign === alignment, true)}
              onClick={() => onUpdate({ textAlign: alignment } as Partial<XhsCoverTextElement>)}
              aria-label={label}
              title={label}
              aria-pressed={textElement.textAlign === alignment}
            >
              <Icon className="size-3.5" />
            </Button>
          ))}
          {([
            ['top', '上', '文字顶部对齐'],
            ['middle', '中', '文字上下居中'],
            ['bottom', '下', '文字底部对齐'],
          ] as const).map(([alignment, label, title]) => (
            <Button
              key={alignment}
              type="button"
              size="icon"
              variant="ghost"
              className={cn(
                getToggleButtonClass(textElement.verticalAlign === alignment, true),
                'text-xs',
              )}
              onClick={() => onUpdate({ verticalAlign: alignment } as Partial<XhsCoverTextElement>)}
              aria-label={title}
              title={title}
              aria-pressed={textElement.verticalAlign === alignment}
            >
              {label}
            </Button>
          ))}
          <input
            type="color"
            value={textElement.color}
            onChange={event => onUpdate({ color: event.target.value } as Partial<XhsCoverTextElement>)}
            className={`
              size-8 cursor-pointer rounded-md border border-black/15 bg-white
              p-1
            `}
            aria-label="封面文字颜色"
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              getToggleButtonClass(textElement.highlightColor !== 'transparent'),
              'text-xs',
            )}
            onClick={() => onUpdate({
              highlightColor: textElement.highlightColor === 'transparent' ? '#fff1a8' : 'transparent',
            } as Partial<XhsCoverTextElement>)}
            aria-label="切换封面文字涂鸦高亮"
            title="涂鸦高亮"
            aria-pressed={textElement.highlightColor !== 'transparent'}
          >
            涂鸦高亮
          </Button>
          <input
            type="color"
            value={textElement.highlightColor === 'transparent' ? '#fff1a8' : textElement.highlightColor}
            onChange={event => onUpdate({ highlightColor: event.target.value } as Partial<XhsCoverTextElement>)}
            className={`
              size-8 cursor-pointer rounded-md border border-black/15 bg-white
              p-1
            `}
            aria-label="封面文字涂鸦高亮颜色"
            title="涂鸦颜色"
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              getToggleButtonClass(textElement.textStrokeWidth > 0),
              'text-xs',
            )}
            onClick={() => onUpdate({
              textStrokeWidth: textElement.textStrokeWidth > 0 ? 0 : 2,
            } as Partial<XhsCoverTextElement>)}
            aria-label="切换封面文字描边"
            title="描边"
            aria-pressed={textElement.textStrokeWidth > 0}
          >
            描边
          </Button>
          <input
            type="color"
            value={textElement.textStrokeColor}
            onChange={event => onUpdate({
              textStrokeColor: event.target.value,
              textStrokeWidth: Math.max(1, textElement.textStrokeWidth),
            } as Partial<XhsCoverTextElement>)}
            className={`
              size-8 cursor-pointer rounded-md border border-black/15 bg-white
              p-1
            `}
            aria-label="封面文字描边颜色"
            title="描边颜色"
          />
          <Input
            type="number"
            min={0}
            max={24}
            step={0.5}
            value={textElement.textStrokeWidth}
            onChange={(event) => {
              const nextWidth = Number(event.target.value)
              onUpdate({
                textStrokeWidth: Number.isFinite(nextWidth)
                  ? Math.min(24, Math.max(0, nextWidth))
                  : 0,
              } as Partial<XhsCoverTextElement>)
            }}
            className={`
              h-8 w-16 border-black/15 bg-white px-2 text-xs text-black
            `}
            aria-label="封面文字描边大小"
            title="描边大小"
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              getToggleButtonClass(textElement.textShadowColor !== 'transparent'),
              'text-xs',
            )}
            onClick={() => onUpdate({
              textShadowColor: textElement.textShadowColor === 'transparent'
                ? XHS_DEFAULT_TEXT_SHADOW.color
                : 'transparent',
            } as Partial<XhsCoverTextElement>)}
            aria-label="切换封面文字阴影"
            title="阴影"
            aria-pressed={textElement.textShadowColor !== 'transparent'}
          >
            阴影
          </Button>
          <input
            type="color"
            value={textElement.textShadowColor === 'transparent'
              ? XHS_DEFAULT_TEXT_SHADOW.color
              : textElement.textShadowColor}
            onChange={event => onUpdate({
              textShadowColor: event.target.value,
            } as Partial<XhsCoverTextElement>)}
            className={`
              size-8 cursor-pointer rounded-md border border-black/15 bg-white
              p-1
            `}
            aria-label="封面文字阴影颜色"
            title="阴影颜色"
          />
          <Input
            type="number"
            min={-60}
            max={60}
            value={textElement.textShadowOffsetX}
            onChange={event => onUpdate({
              textShadowOffsetX: clampNumberInput(event.target.value, -60, 60, textElement.textShadowOffsetX),
            } as Partial<XhsCoverTextElement>)}
            className={`
              h-8 w-16 border-black/15 bg-white px-2 text-xs text-black
            `}
            aria-label="封面文字阴影横向偏移"
            title="阴影 X"
          />
          <Input
            type="number"
            min={-60}
            max={60}
            value={textElement.textShadowOffsetY}
            onChange={event => onUpdate({
              textShadowOffsetY: clampNumberInput(event.target.value, -60, 60, textElement.textShadowOffsetY),
            } as Partial<XhsCoverTextElement>)}
            className={`
              h-8 w-16 border-black/15 bg-white px-2 text-xs text-black
            `}
            aria-label="封面文字阴影纵向偏移"
            title="阴影 Y"
          />
          <Input
            type="number"
            min={0}
            max={60}
            value={textElement.textShadowBlur}
            onChange={event => onUpdate({
              textShadowBlur: clampNumberInput(event.target.value, 0, 60, textElement.textShadowBlur),
            } as Partial<XhsCoverTextElement>)}
            className={`
              h-8 w-16 border-black/15 bg-white px-2 text-xs text-black
            `}
            aria-label="封面文字阴影模糊"
            title="阴影模糊"
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              getToggleButtonClass(textElement.backgroundColor !== 'transparent'),
              'text-xs',
            )}
            onClick={() => onUpdate({
              backgroundColor: textElement.backgroundColor === 'transparent' ? '#ffffff' : 'transparent',
            } as Partial<XhsCoverTextElement>)}
            aria-label="切换封面文字背景"
            aria-pressed={textElement.backgroundColor !== 'transparent'}
          >
            背景
          </Button>
          <input
            type="color"
            value={textElement.backgroundColor === 'transparent' ? '#ffffff' : textElement.backgroundColor}
            onChange={event => onUpdate({ backgroundColor: event.target.value } as Partial<XhsCoverTextElement>)}
            className={`
              size-8 cursor-pointer rounded-md border border-black/15 bg-white
              p-1
            `}
            aria-label="封面文字背景颜色"
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              getToggleButtonClass(textElement.borderWidth > 0),
              'text-xs',
            )}
            onClick={() => onUpdate({ borderWidth: textElement.borderWidth > 0 ? 0 : 2 } as Partial<XhsCoverTextElement>)}
            aria-label="切换封面文字边框"
            aria-pressed={textElement.borderWidth > 0}
          >
            边框
          </Button>
          <input
            type="color"
            value={textElement.borderColor}
            onChange={event => onUpdate({ borderColor: event.target.value, borderWidth: Math.max(2, textElement.borderWidth) } as Partial<XhsCoverTextElement>)}
            className={`
              size-8 cursor-pointer rounded-md border border-black/15 bg-white
              p-1
            `}
            aria-label="封面文字边框颜色"
          />
          <Input
            type="number"
            min={0}
            max={120}
            value={textElement.borderRadius}
            onChange={event => onUpdate({ borderRadius: Number(event.target.value) } as Partial<XhsCoverTextElement>)}
            className={`
              h-8 w-16 border-black/15 bg-white px-2 text-xs text-black
            `}
            aria-label="封面文字圆角"
            title="圆角"
          />
        </>
      )}
      {element.type === 'image' && (
        <>
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
