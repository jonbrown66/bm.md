import type { ChangeEvent } from 'react'
import type { XhsCoverDocument, XhsCoverElement, XhsCoverTemplateId, XhsCoverTextElement } from '@/lib/xhs/cover-document'
import type { XhsSavedCoverStyle } from '@/lib/xhs/cover-storage'
import { ImagePlus, Redo2, Type, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  createCoverTemplateDocument,
  createDefaultCoverDocument,
  removeCoverElement,
  updateCoverElement,
  XHS_DEFAULT_IMAGE_STYLE,
  XHS_DEFAULT_TEXT_SHADOW,
} from '@/lib/xhs/cover-document'
import { commitCoverHistory, createCoverHistory, redoCoverHistory, undoCoverHistory } from '@/lib/xhs/cover-history'
import { deleteSavedCoverStyle, getSavedCoverStyles, saveCoverDocument, saveSavedCoverStyle } from '@/lib/xhs/cover-storage'
import { XhsCoverCanvas } from './xhs-cover-canvas'
import { XhsCoverElementToolbar } from './xhs-cover-element-toolbar'
import { XhsCoverTemplatePicker } from './xhs-cover-template-picker'

const EDITOR_SCALE = 0.64

interface XhsCoverEditorProps {
  open: boolean
  fileId: string
  document: XhsCoverDocument
  savedStyleId?: string | null
  onOpenChange: (open: boolean) => void
  onSaved: (document: XhsCoverDocument) => void
}

function nextZIndex(document: XhsCoverDocument) {
  return Math.max(0, ...document.elements.map(element => element.zIndex)) + 1
}

function nextSavedStyleName(styles: XhsSavedCoverStyle[]) {
  const names = new Set(styles.map(style => style.name))
  let index = 1
  let name = `我的样式 ${String(index).padStart(2, '0')}`
  while (names.has(name)) {
    index += 1
    name = `我的样式 ${String(index).padStart(2, '0')}`
  }
  return name
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result)))
    reader.addEventListener('error', () => reject(reader.error))
    reader.readAsDataURL(file)
  })
}

function decodeImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image), { once: true })
    image.addEventListener('error', () => reject(new Error('无法读取图片')), { once: true })
    image.src = src
  })
}

export function XhsCoverEditor({
  open,
  fileId,
  document,
  savedStyleId = null,
  onOpenChange,
  onSaved,
}: XhsCoverEditorProps) {
  const [history, setHistory] = useState(() => createCoverHistory(document))
  const [draftDocument, setDraftDocument] = useState(document)
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savingCurrentStyle, setSavingCurrentStyle] = useState(false)
  const [deletingCurrentStyle, setDeletingCurrentStyle] = useState(false)
  const [savedStyles, setSavedStyles] = useState<XhsSavedCoverStyle[]>([])
  const [selectedSavedStyleId, setSelectedSavedStyleId] = useState<string | null>(savedStyleId)
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false)
  const initialDocumentRef = useRef(document)
  const draftDocumentRef = useRef(document)
  const imageInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    void getSavedCoverStyles().then((styles) => {
      if (active) {
        setSavedStyles(styles)
      }
    })
    return () => {
      active = false
    }
  }, [])

  const dirty = draftDocument !== initialDocumentRef.current
  const selectedElement = selectedElementId
    ? draftDocument.elements.find(element => element.id === selectedElementId) ?? null
    : null

  const commitDocument = (nextDocument: XhsCoverDocument) => {
    draftDocumentRef.current = nextDocument
    setHistory((current) => {
      const next = commitCoverHistory(current, nextDocument)
      setDraftDocument(next.present)
      return next
    })
  }

  const handleCanvasChange = (nextDocument: XhsCoverDocument, commit: boolean) => {
    if (commit) {
      commitDocument(nextDocument)
    }
    else {
      draftDocumentRef.current = nextDocument
      setDraftDocument(nextDocument)
    }
  }

  const updateSelectedElement = (patch: Partial<XhsCoverElement>) => {
    if (!selectedElement) {
      return
    }
    commitDocument(updateCoverElement(draftDocument, selectedElement.id, patch))
  }

  const deleteSelectedElement = () => {
    if (!selectedElement) {
      return
    }
    commitDocument(removeCoverElement(draftDocument, selectedElement.id))
    setSelectedElementId(null)
  }

  const handleTemplateSelect = (templateId: XhsCoverTemplateId) => {
    commitDocument(createCoverTemplateDocument(templateId, draftDocument))
    setSelectedSavedStyleId(null)
    setSelectedElementId(null)
  }

  const handleSavedStyleSelect = (style: XhsSavedCoverStyle) => {
    commitDocument(structuredClone(style.document))
    setSelectedSavedStyleId(style.id)
    setSelectedElementId(null)
  }

  const handleRestoreDefault = () => {
    commitDocument(createDefaultCoverDocument(''))
    setSelectedSavedStyleId(null)
    setSelectedElementId(null)
    toast.success('已恢复初始默认样式')
  }

  const handleSaveCurrentStyle = async () => {
    setSavingCurrentStyle(true)
    try {
      const savedStyle = await saveSavedCoverStyle(nextSavedStyleName(savedStyles), draftDocumentRef.current)
      setSavedStyles(styles => [savedStyle, ...styles])
      setSelectedSavedStyleId(savedStyle.id)
      toast.success(`已保存为“${savedStyle.name}”`)
    }
    catch (error) {
      const message = error instanceof Error ? error.message : '浏览器存储不可用'
      toast.error(`样式保存失败：${message}`)
    }
    finally {
      setSavingCurrentStyle(false)
    }
  }

  const handleDeleteCurrentStyle = async () => {
    if (!selectedSavedStyleId) {
      return
    }

    const style = savedStyles.find(item => item.id === selectedSavedStyleId)
    setDeletingCurrentStyle(true)
    try {
      await deleteSavedCoverStyle(selectedSavedStyleId)
      setSavedStyles(styles => styles.filter(item => item.id !== selectedSavedStyleId))
      setSelectedSavedStyleId(null)
      toast.success(`已删除“${style?.name ?? '当前样式'}”`)
    }
    catch (error) {
      const message = error instanceof Error ? error.message : '浏览器存储不可用'
      toast.error(`样式删除失败：${message}`)
    }
    finally {
      setDeletingCurrentStyle(false)
    }
  }

  const addText = () => {
    const element: XhsCoverTextElement = {
      id: `text-${crypto.randomUUID()}`,
      type: 'text',
      x: 200,
      y: 400,
      width: 320,
      height: 90,
      zIndex: nextZIndex(draftDocument),
      text: '双击编辑文字',
      fontFamily: 'OPPO Sans',
      fontSize: 48,
      fontWeight: 400,
      color: '#111111',
      highlightColor: 'transparent',
      textStrokeColor: '#ffffff',
      textStrokeWidth: 0,
      textShadowColor: XHS_DEFAULT_TEXT_SHADOW.color,
      textShadowOffsetX: XHS_DEFAULT_TEXT_SHADOW.offsetX,
      textShadowOffsetY: XHS_DEFAULT_TEXT_SHADOW.offsetY,
      textShadowBlur: XHS_DEFAULT_TEXT_SHADOW.blur,
      textAlign: 'center',
      verticalAlign: 'middle',
      lineHeight: 1.25,
      backgroundColor: 'transparent',
      borderColor: '#111111',
      borderWidth: 0,
      borderRadius: 0,
    }
    commitDocument({ ...draftDocument, elements: [...draftDocument.elements, element] })
    setSelectedElementId(element.id)
  }

  const addImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'].includes(file.type)) {
      toast.error('请选择 PNG、JPG、WebP、GIF 或 SVG 图片')
      return
    }

    try {
      const src = await readFileAsDataUrl(file)
      const image = await decodeImage(src)
      const scale = Math.min(1, 420 / image.naturalWidth, 420 / image.naturalHeight)
      const width = Math.max(24, image.naturalWidth * scale)
      const height = Math.max(24, image.naturalHeight * scale)
      const element: XhsCoverElement = {
        id: `image-${crypto.randomUUID()}`,
        type: 'image',
        x: (720 - width) / 2,
        y: (960 - height) / 2,
        width,
        height,
        zIndex: nextZIndex(draftDocument),
        src,
        aspectRatio: image.naturalWidth / image.naturalHeight,
        alt: file.name,
        ...XHS_DEFAULT_IMAGE_STYLE,
      }
      commitDocument({ ...draftDocument, elements: [...draftDocument.elements, element] })
      setSelectedElementId(element.id)
    }
    catch {
      toast.error('图片读取失败，请更换图片后重试')
    }
  }

  const handleUndo = () => {
    setHistory((current) => {
      const next = undoCoverHistory(current)
      draftDocumentRef.current = next.present
      setDraftDocument(next.present)
      return next
    })
  }

  const handleRedo = () => {
    setHistory((current) => {
      const next = redoCoverHistory(current)
      draftDocumentRef.current = next.present
      setDraftDocument(next.present)
      return next
    })
  }

  const requestClose = () => {
    if (dirty) {
      setDiscardConfirmOpen(true)
      return
    }
    onOpenChange(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const currentDocument = draftDocumentRef.current
      await saveCoverDocument(fileId, currentDocument)
      initialDocumentRef.current = currentDocument
      onSaved(currentDocument)
      onOpenChange(false)
      toast.success('封面已保存')
    }
    catch (error) {
      const message = error instanceof Error ? error.message : '浏览器存储不可用'
      toast.error(`封面保存失败：${message}`)
    }
    finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={nextOpen => nextOpen ? onOpenChange(true) : requestClose()}>
      <DialogContent
        className={`
          h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] grid-rows-[auto_1fr]
          gap-0 overflow-hidden p-0
          sm:max-w-6xl
        `}
        showCloseButton={false}
      >
        <DialogHeader className={`
          flex-row items-center justify-between border-b px-4 py-3
        `}
        >
          <div>
            <DialogTitle>编辑小红书封面</DialogTitle>
            <DialogDescription>拖动调整位置，双击文字编辑，拖拽四角缩放。</DialogDescription>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg"
              className="hidden"
              onChange={event => void addImage(event)}
            />
            <Button type="button" variant="outline" size="sm" onClick={addText}>
              <Type className="size-4" />
              文字
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => imageInputRef.current?.click()}>
              <ImagePlus className="size-4" />
              图片
            </Button>
            <Button type="button" variant="ghost" size="icon" disabled={history.past.length === 0} onClick={handleUndo} aria-label="撤销封面修改">
              <Undo2 className="size-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" disabled={history.future.length === 0} onClick={handleRedo} aria-label="重做封面修改">
              <Redo2 className="size-4" />
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={requestClose}>取消</Button>
            <Button type="button" size="sm" disabled={saving} onClick={() => void handleSave()}>
              {saving ? '保存中' : '完成'}
            </Button>
          </div>
        </DialogHeader>

        <div className={`
          grid min-h-0 grid-cols-1 overflow-hidden
          sm:grid-cols-[minmax(0,1fr)_280px]
        `}
        >
          <div className="flex min-h-0 flex-col overflow-hidden bg-muted/50">
            {selectedElement && (
              <div className={`
                flex max-h-36 shrink-0 justify-center overflow-auto border-b
                bg-background/90 p-3
              `}
              >
                <XhsCoverElementToolbar
                  element={selectedElement}
                  placement="dock"
                  onUpdate={updateSelectedElement}
                  onDelete={deleteSelectedElement}
                />
              </div>
            )}
            <div className={`
              flex min-h-0 flex-1 justify-center overflow-auto p-8
            `}
            >
              <div
                className="my-auto shrink-0 shadow-lg"
                style={{ width: 720 * EDITOR_SCALE, height: 960 * EDITOR_SCALE }}
              >
                <div style={{ width: 720, height: 960, transform: `scale(${EDITOR_SCALE})`, transformOrigin: 'top left' }}>
                  <XhsCoverCanvas
                    document={draftDocument}
                    editable
                    scale={EDITOR_SCALE}
                    showElementToolbar={false}
                    selectedElementId={selectedElementId}
                    onSelectedElementIdChange={setSelectedElementId}
                    onDocumentChange={handleCanvasChange}
                  />
                </div>
              </div>
            </div>
          </div>
          <XhsCoverTemplatePicker
            document={draftDocument}
            savedStyles={savedStyles}
            selectedSavedStyleId={selectedSavedStyleId}
            onSelectSavedStyle={handleSavedStyleSelect}
            isSavingCurrentStyle={savingCurrentStyle}
            isDeletingCurrentStyle={deletingCurrentStyle}
            onRestoreDefault={handleRestoreDefault}
            onSaveCurrentStyle={() => void handleSaveCurrentStyle()}
            onDeleteCurrentStyle={() => void handleDeleteCurrentStyle()}
            onSelect={handleTemplateSelect}
          />
        </div>
      </DialogContent>
      <AlertDialog open={discardConfirmOpen} onOpenChange={setDiscardConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>放弃封面修改？</AlertDialogTitle>
            <AlertDialogDescription>尚未保存的文字、图片和位置调整将会丢失。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续编辑</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setDiscardConfirmOpen(false)
                onOpenChange(false)
              }}
            >
              放弃修改
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
