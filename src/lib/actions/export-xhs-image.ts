import { toast } from 'sonner'

export async function exportXhsImages() {
  const pages = Array.from(
    document.querySelectorAll<HTMLElement>('[data-xhs-export-page="true"]'),
  )

  if (pages.length === 0) {
    toast.error('没有可导出的小红书图片')
    return
  }

  try {
    const { snapdom } = await import('@zumer/snapdom')

    for (const [index, page] of pages.entries()) {
      const snapshot = await snapdom(page)
      await snapshot.download({
        filename: `bm-md-xhs-${String(index + 1).padStart(2, '0')}.png`,
      })
    }

    toast.success(`已导出 ${pages.length} 张小红书图片`)
  }
  catch (error) {
    toast.error('导出小红书图片失败')
    console.error(error)
  }
}
