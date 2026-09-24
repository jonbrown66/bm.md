// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { XHS_USABLE_PAGE_HEIGHT } from './preview-layout'
import { buildSemanticPages } from './preview-pagination'

describe('image and preceding text pagination', () => {
  beforeEach(() => {
    const style = document.createElement('style')
    style.textContent = '.xhs-measure-probe { padding-bottom: 54px; }'
    document.head.appendChild(style)
    // jsdom 不执行布局，模拟文字块和等比缩放图片的浏览器高度。
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.tagName === 'IMG') {
        const width = Number.parseFloat(this.style.width) || 600
        return new DOMRect(0, 0, width, 315 * width / 600)
      }
      const root = this.querySelector('#bm-md')
      const contentHeight = Array.from(root?.children ?? [])
        .reduce((height, child) => height + (child.querySelector('img')?.getBoundingClientRect().height ?? Number(child.getAttribute('data-height'))), 0)
      return new DOMRect(0, 0, 720, 69 + contentHeight + 54)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  it.each(['auto-height', 'semantic-block'] as const)('keeps fitting text and image together in %s mode', (mode) => {
    const measure = document.createElement('div')
    measure.innerHTML = '<div id="bm-md"><p data-height="400">正文</p><figure data-height="315"><img alt="配图"></figure></div>'

    const pages = buildSemanticPages(measure, mode)

    expect(pages).toHaveLength(1)
    expect(pages[0]?.html).toContain('正文')
    expect(pages[0]?.html).toContain('<img alt="配图">')
  })

  it.each(['auto-height', 'semantic-block'] as const)('does not move existing copy when an image truly cannot fit in %s mode', (mode) => {
    const measure = document.createElement('div')
    measure.innerHTML = '<div id="bm-md"><p data-height="500">前文</p><p data-height="200">图片说明</p><figure><img alt="配图"></figure><h2 data-height="50">下一节</h2><p data-height="600">后文</p></div>'

    const pages = buildSemanticPages(measure, mode)
    const imagePage = pages.find(page => page.html.includes('<img'))

    expect(pages[0]?.html).toContain('前文')
    expect(pages[0]?.html).toContain('图片说明')
    expect(imagePage?.html).not.toContain('图片说明')
    expect(pages.map(page => page.html).join('').match(/图片说明/g)).toHaveLength(1)
    expect(pages.map(page => page.html).join('').match(/后文/g)).toHaveLength(1)
  })

  it.each(['', '<p data-height="80">后续文案</p>'])('fills the space released by normalized empty blocks even when the image page has other content: %s', (followingHtml) => {
    const measure = document.createElement('div')
    measure.innerHTML = `<div id="bm-md"><p data-height="400">全部文案</p><p data-height="300"> </p><figure><img alt="配图"></figure>${followingHtml}</div>`

    const pages = buildSemanticPages(measure, 'semantic-block')

    expect(pages[0]?.html).toContain('全部文案')
    expect(pages[0]?.html).toContain('<img alt="配图">')
    expect(pages[0]?.html).not.toContain('xhs-fit-scale')
    expect(pages.map(page => page.html).join('').match(/<img/g)).toHaveLength(1)
    if (followingHtml) {
      expect(pages.map(page => page.html).join('')).toContain('后续文案')
    }
  })

  it('scales a slightly oversized image within the 80% limit to stay with all copy', () => {
    const measure = document.createElement('div')
    measure.innerHTML = '<div id="bm-md"><p data-height="500">正文</p><figure><img alt="配图"></figure></div>'
    const pages = buildSemanticPages(measure, 'semantic-block')
    const result = document.createElement('div')
    result.innerHTML = pages[0]?.html ?? ''
    const image = result.querySelector('img')

    expect(pages).toHaveLength(1)
    expect(Number(image?.dataset.xhsFitScale)).toBeGreaterThanOrEqual(0.8)
    expect(123 + 500 + (image?.getBoundingClientRect().height ?? 0)).toBeLessThanOrEqual(XHS_USABLE_PAGE_HEIGHT)
  })
})
