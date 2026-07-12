import type { ChangeEvent } from 'react'
import type { XhsCoverElement, XhsCoverTextElement } from '@/lib/xhs/cover-document'
import { AlignCenter, AlignLeft, AlignRight, Bold, ImageUp, Trash2 } from 'lucide-react'
import { useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface XhsCoverElementToolbarProps {
  element: XhsCoverElement
  canvasScale?: number
  onUpdate: (patch: Partial<XhsCoverElement>) => void
  onDelete: () => void
}

export function XhsCoverElementToolbar({
  element,
  canvasScale = 1,
  onUpdate,
  onDelete,
}: XhsCoverElementToolbarProps) {
  const textElement = element.type === 'text' ? element : null
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
        absolute bottom-full left-0 z-50 mb-3 flex max-w-[680px] flex-wrap
        items-center gap-1.5 rounded-lg border border-black/15 bg-white p-1.5
        text-black shadow-lg
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
            variant={textElement.fontWeight >= 700 ? 'secondary' : 'ghost'}
            className={`
              size-8 bg-white text-black
              hover:bg-neutral-100 hover:text-black
            `}
            onClick={() => onUpdate({ fontWeight: textElement.fontWeight >= 700 ? 400 : 700 } as Partial<XhsCoverTextElement>)}
            aria-label="切换封面文字粗体"
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
              variant={textElement.textAlign === alignment ? 'secondary' : 'ghost'}
              className={`
                size-8 bg-white text-black
                hover:bg-neutral-100 hover:text-black
              `}
              onClick={() => onUpdate({ textAlign: alignment } as Partial<XhsCoverTextElement>)}
              aria-label={label}
              title={label}
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
              variant={textElement.verticalAlign === alignment ? 'secondary' : 'ghost'}
              className={`
                size-8 bg-white text-xs text-black
                hover:bg-neutral-100 hover:text-black
              `}
              onClick={() => onUpdate({ verticalAlign: alignment } as Partial<XhsCoverTextElement>)}
              aria-label={title}
              title={title}
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
            className={`
              h-8 bg-white px-2 text-xs text-black
              hover:bg-neutral-100 hover:text-black
            `}
            onClick={() => onUpdate({
              backgroundColor: textElement.backgroundColor === 'transparent' ? '#ffffff' : 'transparent',
            } as Partial<XhsCoverTextElement>)}
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
            className={`
              h-8 bg-white px-2 text-xs text-black
              hover:bg-neutral-100 hover:text-black
            `}
            onClick={() => onUpdate({ borderWidth: textElement.borderWidth > 0 ? 0 : 2 } as Partial<XhsCoverTextElement>)}
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
