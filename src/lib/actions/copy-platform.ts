import type { SupportedPlatform } from '@/config'
import { toast } from 'sonner'
import { platformConfig } from '@/config'
import { copyHtml } from '@/lib/clipboard'

const developingPlatforms: SupportedPlatform[] = ['zhihu', 'juejin']

export async function copyPlatform(
  platform: SupportedPlatform,
  getHtml: () => Promise<string>,
) {
  if (developingPlatforms.includes(platform)) {
    toast.info('功能开发中，敬请期待')
    return
  }

  const config = platformConfig[platform]
  const toastId = undefined
  try {
    const html = await getHtml()
    if (!html.trim()) {
      toast.error('没有可复制的内容')
      return
    }
    const success = await copyHtml(html)
    if (success) {
      toast.success(config.successMessage, { id: toastId })
    }
    else {
      toast.error('复制失败', { id: toastId })
    }
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : '复制失败', { id: toastId })
  }
}
