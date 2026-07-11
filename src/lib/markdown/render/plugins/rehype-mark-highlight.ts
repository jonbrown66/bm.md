import type { Element, ElementContent, Root } from 'hast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

const highlightColors = new Set(['yellow', 'red', 'blue', 'green', 'purple', 'gray'])

function parseMarkTags(value: string): ElementContent[] {
  const pattern = /==(?:\{([a-z]+)\})?(.+?)==/gi
  const matches = Array.from(value.matchAll(pattern))
  if (matches.length === 0) {
    return [{ type: 'text', value }]
  }

  const nodes: ElementContent[] = []
  let cursor = 0
  for (const match of matches) {
    const index = match.index ?? 0
    if (index > cursor) {
      nodes.push({ type: 'text', value: value.slice(cursor, index) })
    }

    const requestedColor = match[1]?.toLowerCase()
    const color = requestedColor && highlightColors.has(requestedColor)
      ? requestedColor
      : 'yellow'
    nodes.push({
      type: 'element',
      tagName: 'mark',
      properties: {
        className: ['markdown-highlight', `markdown-highlight-${color}`],
        dataHighlight: color,
      },
      children: [{ type: 'text', value: match[2] ?? '' }],
    })
    cursor = index + match[0].length
  }

  if (cursor < value.length) {
    nodes.push({ type: 'text', value: value.slice(cursor) })
  }

  return nodes
}

const rehypeMarkHighlight: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, 'element', (node: Element) => {
      // 忽略代码块内部的文本高亮
      if (node.tagName === 'pre' || node.tagName === 'code') {
        return
      }

      if (node.children?.length) {
        const nextChildren: ElementContent[] = []
        for (const child of node.children) {
          if (child.type === 'text') {
            nextChildren.push(...parseMarkTags(child.value))
          }
          else {
            nextChildren.push(child)
          }
        }
        node.children = nextChildren
      }
    })
  }
}

export default rehypeMarkHighlight
