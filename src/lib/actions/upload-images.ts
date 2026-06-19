import { toast } from 'sonner'
import {
  extractRemoteImageReferences,
  replaceImageUrls,
} from '@/lib/markdown/images'
import { uploadRemoteImages } from '@/services/upload'

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
    return '正在提交到 GitHub 图床...'
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

  const uploadPromise = uploadRemoteImages(urls)

  queueMicrotask(() => {
    toast.loading(getUploadProgressMessage('commit', urls.length), { id: toastId })
  })

  return await uploadPromise
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

  toast.warning(`已上传 ${options.successfulCount} 张图片，${failedCount} 张失败`, {
    id: options.toastId,
    description,
    action: {
      label: '重试失败项',
      onClick: options.retry,
    },
  })
}

export async function uploadMarkdownImages(
  content: string,
  setContent: (content: string) => void,
) {
  const urls = extractRemoteImageReferences(content)

  if (urls.length === 0) {
    toast.info('当前文档没有可上传的远程图片')
    return
  }

  const toastId = toast.loading(getUploadProgressMessage('download', urls.length))
  let latestContent = content

  const retryFailedUrls = async (failedUrls: string[]) => {
    try {
      const { results } = await uploadImageUrls(failedUrls, toastId, true)
      const successful = getSuccessfulImageReplacements(results)

      if (successful.length > 0) {
        latestContent = replaceImageUrls(latestContent, successful)
        setContent(latestContent)
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
      latestContent = replaceImageUrls(latestContent, successful)
      setContent(latestContent)
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
