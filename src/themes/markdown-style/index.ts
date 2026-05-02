export interface MarkdownStyle {
  id: string
  name: string
}

export const markdownStyles: MarkdownStyle[] = [
  { id: 'botanical', name: 'Botanical' },
  { id: 'kiko', name: 'Kiko' },
  { id: 'professional', name: 'Professional' },
]

export const markdownStyleIds = markdownStyles.map(s => s.id) as [string, ...string[]]

export const DEFAULT_MARKDOWN_STYLE_ID = 'professional'

export type MarkdownStyleId = (typeof markdownStyles)[number]['id']

export { loadMarkdownStyleCss } from './loader'
