import type { XhsCoverTextElement } from '@/lib/xhs/cover-document'
import { AlignCenter, AlignLeft, AlignRight, Bold } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { XHS_DEFAULT_TEXT_SHADOW } from '@/lib/xhs/cover-document'
import { clampNumberInput, getToggleButtonClass } from './xhs-cover-toolbar-utils'

interface XhsCoverTextToolbarProps {
  element: XhsCoverTextElement
  onUpdate: (patch: Partial<XhsCoverTextElement>) => void
}

export function XhsCoverTextToolbar({ element, onUpdate }: XhsCoverTextToolbarProps) {
  return (
    <>
      <select
        value={element.fontFamily}
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
        value={element.fontSize}
        onChange={event => onUpdate({ fontSize: Number(event.target.value) } as Partial<XhsCoverTextElement>)}
        className="h-8 w-16 border-black/15 bg-white px-2 text-xs text-black"
        aria-label="封面文字字号"
      />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={getToggleButtonClass(element.fontWeight >= 700, true)}
        onClick={() => onUpdate({ fontWeight: element.fontWeight >= 700 ? 400 : 700 } as Partial<XhsCoverTextElement>)}
        aria-label="切换封面文字粗体"
        aria-pressed={element.fontWeight >= 700}
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
          className={getToggleButtonClass(element.textAlign === alignment, true)}
          onClick={() => onUpdate({ textAlign: alignment } as Partial<XhsCoverTextElement>)}
          aria-label={label}
          title={label}
          aria-pressed={element.textAlign === alignment}
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
            getToggleButtonClass(element.verticalAlign === alignment, true),
            'text-xs',
          )}
          onClick={() => onUpdate({ verticalAlign: alignment } as Partial<XhsCoverTextElement>)}
          aria-label={title}
          title={title}
          aria-pressed={element.verticalAlign === alignment}
        >
          {label}
        </Button>
      ))}
      <input
        type="color"
        value={element.color}
        onChange={event => onUpdate({ color: event.target.value } as Partial<XhsCoverTextElement>)}
        className={`
          size-8 cursor-pointer rounded-md border border-black/15 bg-white p-1
        `}
        aria-label="封面文字颜色"
      />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={cn(
          getToggleButtonClass(element.highlightColor !== 'transparent'),
          'text-xs',
        )}
        onClick={() => onUpdate({
          highlightColor: element.highlightColor === 'transparent' ? '#fff1a8' : 'transparent',
        } as Partial<XhsCoverTextElement>)}
        aria-label="切换封面文字涂鸦高亮"
        title="涂鸦高亮"
        aria-pressed={element.highlightColor !== 'transparent'}
      >
        涂鸦高亮
      </Button>
      <input
        type="color"
        value={element.highlightColor === 'transparent' ? '#fff1a8' : element.highlightColor}
        onChange={event => onUpdate({ highlightColor: event.target.value } as Partial<XhsCoverTextElement>)}
        className={`
          size-8 cursor-pointer rounded-md border border-black/15 bg-white p-1
        `}
        aria-label="封面文字涂鸦高亮颜色"
        title="涂鸦颜色"
      />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={cn(
          getToggleButtonClass(element.textStrokeWidth > 0),
          'text-xs',
        )}
        onClick={() => onUpdate({
          textStrokeWidth: element.textStrokeWidth > 0 ? 0 : 2,
        } as Partial<XhsCoverTextElement>)}
        aria-label="切换封面文字描边"
        title="描边"
        aria-pressed={element.textStrokeWidth > 0}
      >
        描边
      </Button>
      <input
        type="color"
        value={element.textStrokeColor}
        onChange={event => onUpdate({
          textStrokeColor: event.target.value,
          textStrokeWidth: Math.max(1, element.textStrokeWidth),
        } as Partial<XhsCoverTextElement>)}
        className={`
          size-8 cursor-pointer rounded-md border border-black/15 bg-white p-1
        `}
        aria-label="封面文字描边颜色"
        title="描边颜色"
      />
      <Input
        type="number"
        min={0}
        max={24}
        step={0.5}
        value={element.textStrokeWidth}
        onChange={(event) => {
          const nextWidth = Number(event.target.value)
          onUpdate({
            textStrokeWidth: Number.isFinite(nextWidth)
              ? Math.min(24, Math.max(0, nextWidth))
              : 0,
          } as Partial<XhsCoverTextElement>)
        }}
        className="h-8 w-16 border-black/15 bg-white px-2 text-xs text-black"
        aria-label="封面文字描边大小"
        title="描边大小"
      />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={cn(
          getToggleButtonClass(element.textShadowColor !== 'transparent'),
          'text-xs',
        )}
        onClick={() => onUpdate({
          textShadowColor: element.textShadowColor === 'transparent'
            ? XHS_DEFAULT_TEXT_SHADOW.color
            : 'transparent',
        } as Partial<XhsCoverTextElement>)}
        aria-label="切换封面文字阴影"
        title="阴影"
        aria-pressed={element.textShadowColor !== 'transparent'}
      >
        阴影
      </Button>
      <input
        type="color"
        value={element.textShadowColor === 'transparent'
          ? XHS_DEFAULT_TEXT_SHADOW.color
          : element.textShadowColor}
        onChange={event => onUpdate({
          textShadowColor: event.target.value,
        } as Partial<XhsCoverTextElement>)}
        className={`
          size-8 cursor-pointer rounded-md border border-black/15 bg-white p-1
        `}
        aria-label="封面文字阴影颜色"
        title="阴影颜色"
      />
      <Input
        type="number"
        min={-60}
        max={60}
        value={element.textShadowOffsetX}
        onChange={event => onUpdate({
          textShadowOffsetX: clampNumberInput(event.target.value, -60, 60, element.textShadowOffsetX),
        } as Partial<XhsCoverTextElement>)}
        className="h-8 w-16 border-black/15 bg-white px-2 text-xs text-black"
        aria-label="封面文字阴影横向偏移"
        title="阴影 X"
      />
      <Input
        type="number"
        min={-60}
        max={60}
        value={element.textShadowOffsetY}
        onChange={event => onUpdate({
          textShadowOffsetY: clampNumberInput(event.target.value, -60, 60, element.textShadowOffsetY),
        } as Partial<XhsCoverTextElement>)}
        className="h-8 w-16 border-black/15 bg-white px-2 text-xs text-black"
        aria-label="封面文字阴影纵向偏移"
        title="阴影 Y"
      />
      <Input
        type="number"
        min={0}
        max={60}
        value={element.textShadowBlur}
        onChange={event => onUpdate({
          textShadowBlur: clampNumberInput(event.target.value, 0, 60, element.textShadowBlur),
        } as Partial<XhsCoverTextElement>)}
        className="h-8 w-16 border-black/15 bg-white px-2 text-xs text-black"
        aria-label="封面文字阴影模糊"
        title="阴影模糊"
      />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={cn(
          getToggleButtonClass(element.backgroundColor !== 'transparent'),
          'text-xs',
        )}
        onClick={() => onUpdate({
          backgroundColor: element.backgroundColor === 'transparent' ? '#ffffff' : 'transparent',
        } as Partial<XhsCoverTextElement>)}
        aria-label="切换封面文字背景"
        aria-pressed={element.backgroundColor !== 'transparent'}
      >
        背景
      </Button>
      <input
        type="color"
        value={element.backgroundColor === 'transparent' ? '#ffffff' : element.backgroundColor}
        onChange={event => onUpdate({ backgroundColor: event.target.value } as Partial<XhsCoverTextElement>)}
        className={`
          size-8 cursor-pointer rounded-md border border-black/15 bg-white p-1
        `}
        aria-label="封面文字背景颜色"
      />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={cn(
          getToggleButtonClass(element.borderWidth > 0),
          'text-xs',
        )}
        onClick={() => onUpdate({ borderWidth: element.borderWidth > 0 ? 0 : 2 } as Partial<XhsCoverTextElement>)}
        aria-label="切换封面文字边框"
        aria-pressed={element.borderWidth > 0}
      >
        边框
      </Button>
      <input
        type="color"
        value={element.borderColor}
        onChange={event => onUpdate({ borderColor: event.target.value, borderWidth: Math.max(2, element.borderWidth) } as Partial<XhsCoverTextElement>)}
        className={`
          size-8 cursor-pointer rounded-md border border-black/15 bg-white p-1
        `}
        aria-label="封面文字边框颜色"
      />
      <Input
        type="number"
        min={0}
        max={120}
        value={element.borderRadius}
        onChange={event => onUpdate({ borderRadius: Number(event.target.value) } as Partial<XhsCoverTextElement>)}
        className="h-8 w-16 border-black/15 bg-white px-2 text-xs text-black"
        aria-label="封面文字圆角"
        title="圆角"
      />
    </>
  )
}
