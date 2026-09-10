import fileSaver from 'file-saver'
import { toast } from 'sonner'
import { getExportBaseName } from './export-filename'

const { saveAs } = fileSaver

export function exportMarkdown(content: string, fileName?: string) {
  if (!content.trim()) {
    toast.error('没有可导出的内容')
    return
  }

  const exportFileName = fileName ?? `${getExportBaseName(content)}.md`

  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  saveAs(blob, exportFileName)
  toast.success('已导出 Markdown 文件')
}
