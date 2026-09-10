import { beforeEach, describe, expect, it } from 'vitest'
import { useFilesStore } from '@/stores/files'
import {
  extractH1Title,
  formatXhsImageFilename,
  getExportBaseName,
  sanitizeFilename,
} from './export-filename'

describe('export-filename', () => {
  beforeEach(() => {
    useFilesStore.setState({
      files: [],
      activeFileId: null,
      currentContent: '',
    })
  })

  describe('sanitizeFilename', () => {
    it('cleans invalid Windows characters', () => {
      expect(sanitizeFilename('我的文章/测试\\文件:名称*标题?问号"引号<左>右|竖线'))
        .toBe('我的文章测试文件名称标题问号引号左右竖线')
    })

    it('collapses consecutive spaces and trims edges', () => {
      expect(sanitizeFilename('   小红书   排版   指南   '))
        .toBe('小红书 排版 指南')
    })

    it('handles empty or pure invalid strings', () => {
      expect(sanitizeFilename(':*?"<>|')).toBe('')
    })
  })

  describe('extractH1Title', () => {
    it('extracts normal H1 title', () => {
      const content = '# 深入理解 TypeScript\n\n正文内容...'
      expect(extractH1Title(content)).toBe('深入理解 TypeScript')
    })

    it('strips markdown formatting from H1 title', () => {
      const content = '# **加粗** `代码` [链接] 标题\n\n正文...'
      expect(extractH1Title(content)).toBe('加粗 代码 链接 标题')
    })

    it('returns null if no H1 title is found', () => {
      const content = '## 二级标题\n\n正文内容...'
      expect(extractH1Title(content)).toBeNull()
    })

    it('returns null for empty content', () => {
      expect(extractH1Title('')).toBeNull()
    })
  })

  describe('getExportBaseName', () => {
    it('uses customTitle when provided', () => {
      expect(getExportBaseName('', '自定义标题:测试')).toBe('自定义标题测试')
    })

    it('uses active file name when not default bm.md', () => {
      useFilesStore.setState({
        files: [
          { id: '1', name: '微信公众号排版.md', createdAt: 0, updatedAt: 0 },
        ],
        activeFileId: '1',
      })
      expect(getExportBaseName()).toBe('微信公众号排版')
    })

    it('extracts H1 title from content when active file is bm.md', () => {
      useFilesStore.setState({
        files: [
          { id: '1', name: 'bm.md', createdAt: 0, updatedAt: 0 },
        ],
        activeFileId: '1',
        currentContent: '# 小红书爆款排版秘密\n\n正文...',
      })
      expect(getExportBaseName()).toBe('小红书爆款排版秘密')
    })

    it('falls back to bm when no title or active file exists', () => {
      useFilesStore.setState({
        files: [],
        activeFileId: null,
        currentContent: '没有任何标题的内容',
      })
      expect(getExportBaseName()).toBe('bm')
    })
  })

  describe('formatXhsImageFilename', () => {
    it('formats sequential numbers with title prefix', () => {
      expect(formatXhsImageFilename(1, '爆款指南')).toBe('01_爆款指南.png')
      expect(formatXhsImageFilename(2, '爆款指南')).toBe('02_爆款指南.png')
      expect(formatXhsImageFilename(10, '爆款指南')).toBe('10_爆款指南.png')
    })

    it('formats pure sequence when title is omitted or empty', () => {
      expect(formatXhsImageFilename(1)).toBe('01.png')
      expect(formatXhsImageFilename(5, '')).toBe('05.png')
    })

    it('sanitizes title in filename', () => {
      expect(formatXhsImageFilename(1, '前端/进阶:必看?')).toBe('01_前端进阶必看.png')
    })
  })
})
