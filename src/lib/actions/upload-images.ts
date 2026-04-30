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

export async function uploadMarkdownImages(
  content: string,
  setContent: (content: string) => void,
) {
  const urls = extractRemoteImageReferences(content)

  if (urls.length === 0) {
    toast.info('当前文档没有可上传的远程图片')
    return
  }

  const toastId = toast.loading(`正在上传 ${urls.length} 张图片...`)

  try {
    const { results } = await uploadRemoteImages(urls)
    const successful = results.flatMap((result) => {
      if (result.status !== 'success' || !result.newUrl) {
        return []
      }

      return [{
        oldUrl: result.oldUrl,
        newUrl: result.newUrl,
      }]
    })

    if (successful.length > 0) {
      setContent(replaceImageUrls(content, successful))
    }

    const failedCount = results.length - successful.length
    if (failedCount > 0) {
      const description = getUploadFailureDescription(results)
      console.warn('图片上传失败明细:', results.filter(result => result.status === 'failed'))
      toast.warning(`已上传 ${successful.length} 张图片，${failedCount} 张失败`, {
        id: toastId,
        description,
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
