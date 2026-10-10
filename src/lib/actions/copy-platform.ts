import type { SupportedPlatform } from '@/config'
import { toast } from 'sonner'
import { platformConfig } from '@/config'
import { copyHtml } from '@/lib/clipboard'
import { prepareWechatImages } from './prepare-wechat-images'

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
  let toastId: string | number | undefined
  try {
    let html = await getHtml()
    if (!html.trim()) {
      toast.error('没有可复制的内容')
      return
    }
    if (platform === 'wechat') {
      toastId = toast.loading('正在处理公众号图片（单张上限 5MB）...')
      html = await prepareWechatImages(html)
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
