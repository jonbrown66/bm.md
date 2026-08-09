import type { XhsCoverDocument, XhsCoverTemplateId } from '@/lib/xhs/cover-document'
import type { XhsSavedCoverStyle } from '@/lib/xhs/cover-storage'
import { Check, RotateCcw, Save, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { createCoverTemplateDocument, XHS_COVER_TEMPLATES } from '@/lib/xhs/cover-document'
import { XhsCoverCanvas } from './xhs-cover-canvas'

const TEMPLATE_PREVIEW_SCALE = 0.15

interface XhsCoverTemplatePickerProps {
  document: XhsCoverDocument
  savedStyles: XhsSavedCoverStyle[]
  selectedSavedStyleId: string | null
  onSelect: (templateId: XhsCoverTemplateId) => void
  onSelectSavedStyle: (style: XhsSavedCoverStyle) => void
  onRestoreDefault: () => void
  onSaveCurrentStyle: () => void
  onDeleteCurrentStyle: () => void
  isSavingCurrentStyle?: boolean
  isDeletingCurrentStyle?: boolean
}

interface CoverStylePreviewProps {
  document: XhsCoverDocument
  backgroundColor: string
  selected: boolean
}

function CoverStylePreview({ document, backgroundColor, selected }: CoverStylePreviewProps) {
  return (
    <div
      className={cn(
        `
          relative aspect-[3/4] w-full overflow-hidden rounded-lg border
          border-black/10 bg-white shadow-sm
        `,
        selected && 'border-foreground/40',
      )}
      style={{ backgroundColor }}
    >
      <div
        className="origin-top-left"
        style={{
          width: 720,
          height: 960,
          transform: `scale(${TEMPLATE_PREVIEW_SCALE})`,
          transformOrigin: 'top left',
        }}
      >
        <XhsCoverCanvas document={document} />
      </div>
      {selected && (
        <span className={`
          absolute top-1.5 right-1.5 flex size-5 items-center justify-center
          rounded-full bg-foreground text-background
        `}
        >
          <Check className="size-3" strokeWidth={2.5} />
        </span>
      )}
    </div>
  )
}

export function XhsCoverTemplatePicker({
  document,
  savedStyles,
  selectedSavedStyleId,
  onSelect,
  onSelectSavedStyle,
  onRestoreDefault,
  onSaveCurrentStyle,
  onDeleteCurrentStyle,
  isSavingCurrentStyle = false,
  isDeletingCurrentStyle = false,
}: XhsCoverTemplatePickerProps) {
  const templatePreviews = useMemo(
    () => XHS_COVER_TEMPLATES.map(template => ({
      template,
      document: createCoverTemplateDocument(template.id, document),
    })),
    [document],
  )
  const selectedSavedStyle = savedStyles.find(style => style.id === selectedSavedStyleId) ?? null

  return (
    <aside className={`
      min-h-0 overflow-y-auto border-t bg-background p-4
      sm:border-t-0 sm:border-l
    `}
    >
      <div className="space-y-5">
        <div className="space-y-1">
          <p className={`
            text-[10px] font-semibold tracking-[0.18em] text-muted-foreground
          `}
          >
            COVER STYLES
          </p>
          <h3 className="text-sm font-semibold tracking-tight">封面样式</h3>
          <p className="text-xs leading-5 text-muted-foreground">
            固定模板和保存的完整封面都可以直接套用。
          </p>
        </div>

        <div className="grid gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-start"
            onClick={onRestoreDefault}
          >
            <RotateCcw className="size-4" />
            恢复默认样式
          </Button>
          <Button
            type="button"
            size="sm"
            className="justify-start"
            disabled={isSavingCurrentStyle}
            onClick={onSaveCurrentStyle}
          >
            <Save className="size-4" />
            {isSavingCurrentStyle ? '保存中…' : '保存当前样式'}
          </Button>
          {selectedSavedStyle && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={`
                justify-start text-destructive
                hover:bg-destructive/10 hover:text-destructive
              `}
              disabled={isDeletingCurrentStyle}
              onClick={onDeleteCurrentStyle}
            >
              <Trash2 className="size-4" />
              {isDeletingCurrentStyle ? '删除中…' : '删除当前样式'}
            </Button>
          )}
        </div>

        {savedStyles.length > 0 && (
          <section className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold tracking-tight">已保存样式</h3>
                <p className="text-xs leading-5 text-muted-foreground">
                  完整保留布局、图片和文字
                </p>
              </div>
              <span className={`
                rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium
                text-muted-foreground
              `}
              >
                {savedStyles.length}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {savedStyles.map((style) => {
                const selected = selectedSavedStyleId === style.id

                return (
                  <Button
                    key={style.id}
                    type="button"
                    variant="ghost"
                    aria-pressed={selected}
                    className={cn(
                      `
                        group h-auto min-w-0 flex-col items-stretch rounded-xl
                        p-1.5 text-left
                        hover:bg-muted/60
                      `,
                      selected && 'bg-muted/80 ring-1 ring-foreground/20',
                    )}
                    onClick={() => onSelectSavedStyle(style)}
                  >
                    <CoverStylePreview
                      document={style.document}
                      backgroundColor={style.document.backgroundColor ?? '#ffffff'}
                      selected={selected}
                    />
                    <span className={`
                      truncate px-0.5 pt-1 text-xs font-medium text-foreground
                    `}
                    >
                      {style.name}
                    </span>
                    <span className={`
                      truncate px-0.5 text-[10px] leading-4
                      text-muted-foreground
                    `}
                    >
                      完整布局快照
                    </span>
                  </Button>
                )
              })}
            </div>
          </section>
        )}

        <section className="space-y-3 border-t pt-4">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">固定模板</h3>
            <p className="text-xs leading-5 text-muted-foreground">
              点击即可套用，标题、图片和位置仍可继续微调。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {templatePreviews.map(({ template, document: previewDocument }) => {
              const selected = !selectedSavedStyleId && document.templateId === template.id

              return (
                <Button
                  key={template.id}
                  type="button"
                  variant="ghost"
                  aria-pressed={selected}
                  className={cn(
                    `
                      group h-auto min-w-0 flex-col items-stretch rounded-xl
                      p-1.5 text-left
                      hover:bg-muted/60
                    `,
                    selected && 'bg-muted/80 ring-1 ring-foreground/20',
                  )}
                  onClick={() => onSelect(template.id)}
                >
                  <CoverStylePreview
                    document={previewDocument}
                    backgroundColor={template.swatch.background}
                    selected={selected}
                  />
                  <span className={`
                    flex min-w-0 items-center gap-1.5 px-0.5 pt-1
                  `}
                  >
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: template.swatch.accent }}
                    />
                    <span className={`
                      truncate text-xs font-medium text-foreground
                    `}
                    >
                      {template.name}
                    </span>
                  </span>
                  <span className={`
                    line-clamp-2 px-0.5 text-[10px] leading-4
                    text-muted-foreground
                  `}
                  >
                    {template.description}
                  </span>
                </Button>
              )
            })}
          </div>
        </section>
      </div>
    </aside>
  )
}
