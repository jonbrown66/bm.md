import { toast } from 'sonner'

export interface PreviewIframe {
  iframe: HTMLIFrameElement
  content: HTMLElement
}

export function setPreviewImageCaptionVisibility(
  iframe: HTMLIFrameElement | null | undefined,
  show: boolean,
) {
  const body = iframe?.contentDocument?.body
  if (!body) {
    return
  }

  body.dataset.showImageCaption = String(show)
}

export function getPreviewIframe(): PreviewIframe | null {
  try {
    const iframe = document.querySelector('#bm-preview-iframe') as HTMLIFrameElement | null
    if (!iframe?.contentDocument?.body) {
      toast.error('预览区域尚未就绪')
      return null
    }

    const content = iframe.contentDocument.getElementById('bm-md')
    if (!content) {
      toast.error('没有可操作的内容')
      return null
    }

    return { iframe, content }
  }
  catch {
    toast.error('无法访问预览内容')
    return null
  }
}

export function getPreviewElement(): HTMLElement | null {
  return getPreviewIframe()?.content ?? null
}

export async function withPreviewImageCaptions<T>(
  callback: (preview: PreviewIframe) => T | Promise<T>,
): Promise<T | null> {
  const preview = getPreviewIframe()
  if (!preview) {
    return null
  }

  const body = preview.iframe.contentDocument?.body
  const previousValue = body?.dataset.showImageCaption
  setPreviewImageCaptionVisibility(preview.iframe, true)

  try {
    return await callback(preview)
  }
  finally {
    if (body) {
      if (previousValue === undefined) {
        delete body.dataset.showImageCaption
      }
      else {
        body.dataset.showImageCaption = previousValue
      }
    }
  }
}
