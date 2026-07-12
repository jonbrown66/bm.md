import type { ChangeEvent } from 'react'
import type { XhsCoverDocument, XhsCoverElement, XhsCoverTextElement } from '@/lib/xhs/cover-document'
import { ImagePlus, Redo2, Type, Undo2 } from 'lucide-react'
import { useRef, useState } from 'react'
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
import { commitCoverHistory, createCoverHistory, redoCoverHistory, undoCoverHistory } from '@/lib/xhs/cover-history'
import { saveCoverDocument } from '@/lib/xhs/cover-storage'
import { XhsCoverCanvas } from './xhs-cover-canvas'

const EDITOR_SCALE = 0.64

interface XhsCoverEditorProps {
  open: boolean
  fileId: string
  document: XhsCoverDocument
  onOpenChange: (open: boolean) => void
  onSaved: (document: XhsCoverDocument) => void
}

function nextZIndex(document: XhsCoverDocument) {
  return Math.max(0, ...document.elements.map(element => element.zIndex)) + 1
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
  onOpenChange,
  onSaved,
}: XhsCoverEditorProps) {
  const [history, setHistory] = useState(() => createCoverHistory(document))
  const [draftDocument, setDraftDocument] = useState(document)
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false)
  const initialDocumentRef = useRef(document)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const dirty = draftDocument !== initialDocumentRef.current

  const commitDocument = (nextDocument: XhsCoverDocument) => {
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
      setDraftDocument(nextDocument)
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
      setDraftDocument(next.present)
      return next
    })
  }

  const handleRedo = () => {
    setHistory((current) => {
      const next = redoCoverHistory(current)
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
      await saveCoverDocument(fileId, draftDocument)
      initialDocumentRef.current = draftDocument
      onSaved(draftDocument)
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
          flex min-h-0 items-center justify-center overflow-auto bg-muted/50 p-8
        `}
        >
          <div
            className="shrink-0 shadow-lg"
            style={{ width: 720 * EDITOR_SCALE, height: 960 * EDITOR_SCALE }}
          >
            <div style={{ width: 720, height: 960, transform: `scale(${EDITOR_SCALE})`, transformOrigin: 'top left' }}>
              <XhsCoverCanvas
                document={draftDocument}
                editable
                scale={EDITOR_SCALE}
                selectedElementId={selectedElementId}
                onSelectedElementIdChange={setSelectedElementId}
                onDocumentChange={handleCanvasChange}
              />
            </div>
          </div>
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
