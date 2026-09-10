import { useFilesStore } from '@/stores/files'

const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g

/**
 * 清理文件名中的非法字符（适配 Windows、macOS 及 Linux 文件系统）
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(INVALID_FILENAME_CHARS, '')
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * 提取 Markdown 文本中的一级标题（# 标题）
 */
export function extractH1Title(content: string): string | null {
  const lines = content.split('\n')
  for (const line of lines) {
    if (line.startsWith('# ')) {
      const title = line.slice(2).trim().replace(/[*_`[\]]/g, '').trim()
      return title || null
    }
  }
  return null
}

/**
 * 获取导出的文件基础名称（不含扩展名）
 * 优先级：
 * 1. 显式传入的 customTitle
 * 2. 当前活跃文件名称（若非默认 bm.md）
 * 3. Markdown 内容中的一级标题（# 标题）
 * 4. 活跃文件名（即便为 bm.md）
 * 5. 兜底默认名称 'bm'
 */
export function getExportBaseName(content?: string, customTitle?: string): string {
  if (customTitle) {
    const sanitized = sanitizeFilename(customTitle)
    if (sanitized) {
      return sanitized
    }
  }

  const filesStore = useFilesStore.getState()
  const activeFile = filesStore.getActiveFile()
  const currentContent = content ?? filesStore.currentContent

  if (activeFile?.name && activeFile.name.toLowerCase() !== 'bm.md') {
    const nameWithoutExt = activeFile.name.replace(/\.md$/i, '').trim()
    const sanitized = sanitizeFilename(nameWithoutExt)
    if (sanitized) {
      return sanitized
    }
  }

  if (currentContent) {
    const h1Title = extractH1Title(currentContent)
    if (h1Title) {
      const sanitized = sanitizeFilename(h1Title)
      if (sanitized) {
        return sanitized
      }
    }
  }

  if (activeFile?.name) {
    const nameWithoutExt = activeFile.name.replace(/\.md$/i, '').trim()
    const sanitized = sanitizeFilename(nameWithoutExt)
    if (sanitized) {
      return sanitized
    }
  }

  return 'bm'
}

/**
 * 格式化小红书等多图导出时的图片文件名
 * 规则：序号前缀 + 文章名（如 01_文章标题.png、02_文章标题.png...）
 * 若文章名为空，则回退为纯序号（如 01.png）
 */
export function formatXhsImageFilename(pageNumber: number, title?: string): string {
  const seq = String(pageNumber).padStart(2, '0')
  const cleanTitle = title ? sanitizeFilename(title) : ''
  return cleanTitle ? `${seq}_${cleanTitle}.png` : `${seq}.png`
}
