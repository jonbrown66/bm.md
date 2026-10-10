import { createElement } from 'react'
import { toast } from 'sonner'
import { REMOTE_UPLOAD_BATCH_SIZE } from '@/lib/image-upload-policy'
import {
  extractRemoteImageReferences,
  replaceImageUrls,
} from '@/lib/markdown/images'
import { uploadRemoteImages } from '@/services/upload'
import { UploadFailuresDescription } from './upload-failures-description'

interface UploadImagesResult {
  oldUrl: string
  newUrl?: string
  status: 'success' | 'failed'
  error?: string
}

type UploadProgressPhase = 'download' | 'commit' | 'retry'

export function getUploadFailureDescription(results: UploadImagesResult[]): string | undefined {
  const failures = results.filter(result => result.status === 'failed')

  if (failures.length === 0) {
    return undefined
  }

  return failures
    .slice(0, 3)
    .map((result) => {
      const reason = result.error || '未知原因'
      return `${reason}: ${result.oldUrl}`
    })
    .join('\n')
}

export function getFailedImageUrls(results: UploadImagesResult[]): string[] {
  return results
    .filter(result => result.status === 'failed')
    .map(result => result.oldUrl)
}

export function getUploadProgressMessage(phase: UploadProgressPhase, count: number): string {
  if (phase === 'download') {
    return `正在下载 ${count} 张图片...`
  }

  if (phase === 'commit') {
    return '正在处理并上传图片，自动压缩至 5MB 以下...'
  }

  return `正在重试 ${count} 张失败图片...`
}

function getSuccessfulImageReplacements(results: UploadImagesResult[]) {
  return results.flatMap((result) => {
    if (result.status !== 'success' || !result.newUrl) {
      return []
    }

    return [{
      oldUrl: result.oldUrl,
      newUrl: result.newUrl,
    }]
  })
}

async function uploadImageUrls(urls: string[], toastId: string | number, retry = false) {
  toast.loading(
    retry
      ? getUploadProgressMessage('retry', urls.length)
      : getUploadProgressMessage('download', urls.length),
    { id: toastId },
  )

  const results: UploadImagesResult[] = []
  for (let index = 0; index < urls.length; index += REMOTE_UPLOAD_BATCH_SIZE) {
    const batch = urls.slice(index, index + REMOTE_UPLOAD_BATCH_SIZE)
    toast.loading(`正在处理并上传图片 ${index + 1}–${index + batch.length}/${urls.length}，单张低于 5MB...`, { id: toastId })
    try {
      const response = await uploadRemoteImages(batch)
      // 未返回的结果也作为失败项，避免请求中断后遗漏图片。
      results.push(...batch.map(oldUrl => response.results.find(result => result.oldUrl === oldUrl)
        ?? { oldUrl, status: 'failed' as const, error: '上传未返回结果，请重试' }))
    }
    catch (error) {
      results.push(...batch.map(oldUrl => ({ oldUrl, status: 'failed' as const, error: error instanceof Error ? error.message : '图片上传失败' })))
    }
  }
  return { results }
}

function showUploadFailuresToast(options: {
  toastId: string | number
  successfulCount: number
  failedUrls: string[]
  retry: () => void
  results: UploadImagesResult[]
}) {
  const description = getUploadFailureDescription(options.results)
  const failedCount = options.failedUrls.length

  console.warn('图片上传失败明细:', description)
  console.warn('图片上传失败数据:', JSON.stringify(
    options.results.filter(result => result.status === 'failed'),
    null,
    2,
  ))

  const title = options.successfulCount > 0
    ? `已上传 ${options.successfulCount} 张图片，${failedCount} 张失败`
    : `${failedCount} 张图片上传失败`

  toast.warning(title, {
    id: options.toastId,
    description: createElement(UploadFailuresDescription, {
      results: options.results.filter(result => result.status === 'failed'),
    }),
    action: {
      label: '重试失败项',
      onClick: options.retry,
    },
    classNames: {
      toast: '!items-start !w-[420px] max-w-[90vw]',
      content: 'min-w-0 flex-1',
      actionButton: '!shrink-0 !mt-1',
    },
    duration: 8000,
  })
}

export async function uploadMarkdownImages(
  content: string,
  setContent: (content: string) => void,
  getContent?: () => string | undefined,
) {
  const urls = extractRemoteImageReferences(content)

  if (urls.length === 0) {
    toast.info('当前文档没有可上传的远程图片')
    return
  }

  const toastId = toast.loading(getUploadProgressMessage('download', urls.length))
  let latestContent = content
  const applyReplacements = (successful: { oldUrl: string, newUrl: string }[]) => {
    const current = getContent ? getContent() : latestContent
    if (current === undefined) {
      throw new Error('图片已上传，但文档已切换，未修改当前文档；返回原文档后可再次一键上传')
    }
    latestContent = replaceImageUrls(current, successful)
    setContent(latestContent)
  }

  const retryFailedUrls = async (failedUrls: string[]) => {
    try {
      const { results } = await uploadImageUrls(failedUrls, toastId, true)
      const successful = getSuccessfulImageReplacements(results)

      if (successful.length > 0) {
        applyReplacements(successful)
      }

      const failedAgainUrls = getFailedImageUrls(results)
      if (failedAgainUrls.length > 0) {
        showUploadFailuresToast({
          toastId,
          successfulCount: successful.length,
          failedUrls: failedAgainUrls,
          results,
          retry: () => {
            void retryFailedUrls(failedAgainUrls)
          },
        })
        return
      }

      toast.success(`已重试并替换 ${successful.length} 张图片`, { id: toastId })
    }
    catch (error) {
      console.error('Markdown images retry upload error:', error)
      toast.error(error instanceof Error ? error.message : '重试上传图片失败', { id: toastId })
    }
  }

  try {
    const { results } = await uploadImageUrls(urls, toastId)
    const successful = getSuccessfulImageReplacements(results)

    if (successful.length > 0) {
      applyReplacements(successful)
    }

    const failedUrls = getFailedImageUrls(results)
    if (failedUrls.length > 0) {
      showUploadFailuresToast({
        toastId,
        successfulCount: successful.length,
        failedUrls,
        results,
        retry: () => {
          void retryFailedUrls(failedUrls)
        },
      })
      return
    }

    toast.success(`已上传并替换 ${successful.length} 张图片`, { id: toastId })
  }
  catch (error) {
    console.error('Markdown images upload error:', error)
    toast.error(error instanceof Error ? error.message : '批量上传图片失败', { id: toastId })
  }
}
