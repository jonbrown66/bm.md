import type { Code, HTML } from 'mdast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

export const remarkMermaid: Plugin = () => {
  return (tree) => {
    visit(tree, 'code', (node: Code, index, parent) => {
      if (node.lang !== 'mermaid' || !parent || index === undefined) {
        return
      }

      // 将代码块替换为 HTML 类型的 div，由预览端 Mermaid 识别
      const newNode: HTML = {
        type: 'html',
        value: `<div class="mermaid">${node.value}</div>`,
      }

      ;(parent as any).children[index] = newNode
    })
  }
}
