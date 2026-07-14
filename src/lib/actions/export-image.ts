import type { CaptureResult } from '@zumer/snapdom'
import fileSaver from 'file-saver'
import { toast } from 'sonner'
import { copyImage as copyImageToClipboard } from '@/lib/clipboard'
import { getPreviewElement } from './preview'

const IMAGE_EXPORT_DPR = 2
const { saveAs } = fileSaver

async function createPreviewSnapshot(): Promise<CaptureResult | null> {
  const previewContent = getPreviewElement()
  if (!previewContent)
    return null

  const { snapdom } = await import('@zumer/snapdom')
  return snapdom(previewContent)
}

export async function exportImage() {
  try {
    const snapshot = await createPreviewSnapshot()
    if (!snapshot)
      return

    const blob = await snapshot.toBlob({
      type: 'jpeg',
      quality: 0.99,
      dpr: IMAGE_EXPORT_DPR,
    })
    saveAs(blob, 'bm.md.jpg')
    toast.success('已导出图片')
  }
  catch (error) {
    toast.error('导出图片失败')
    console.error(error)
  }
}

export async function copyImage() {
  try {
    const snapshot = await createPreviewSnapshot()
    if (!snapshot)
      return

    const blob = await snapshot.toBlob({
      type: 'png',
      dpr: IMAGE_EXPORT_DPR,
    })
    await copyImageToClipboard(blob)
    toast.success('已复制图片到剪贴板')
  }
  catch (error) {
    toast.error('复制图片失败')
    console.error(error)
  }
}
