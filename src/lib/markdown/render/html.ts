import type { Plugin } from 'unified'
import type { Platform } from './adapters'
import juice from 'juice'
import rehypeExternalLinks from 'rehype-external-links'
import rehypeGithubAlert from 'rehype-github-alert'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { loadCodeThemeCss } from '@/themes/code-theme/loader'
import { loadMarkdownStyleCss } from '@/themes/markdown-style/loader'
import { loadKatexCss } from '../utils'
import { getAdapterPlugins } from './adapters'
import { rehypeDivToSection, rehypeFigureWrapper, rehypeFootnoteLinks, rehypeWrapTextNodes, remarkFrontmatterTable, remarkMermaid } from './plugins'

export interface RenderOptions {
  markdown: string
  markdownStyle?: string
  codeTheme?: string
  customCss?: string
  enableFootnoteLinks?: boolean
  openLinksInNewWindow?: boolean
  platform?: Platform
  footnoteLabel?: string
  referenceTitle?: string
}

interface ProcessorOptions {
  enableFootnoteLinks?: boolean
  openLinksInNewWindow?: boolean
  platform?: Platform
  footnoteLabel?: string
  referenceTitle?: string
}

interface ComposeCssOptions {
  markdownStyle?: string
  markdownStyleCss?: string
  codeThemeCss?: string
  katexCss?: string
  customCss?: string
}

const sanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...(defaultSchema.protocols || {}),
    href: ['http', 'https', 'mailto', 'tel'],
  },
  tagNames: [
    ...(defaultSchema.tagNames || []),
    'svg',
    'path',
    'figcaption',
    'section',
  ],
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a || []), 'target', 'rel'],
    div: [...(defaultSchema.attributes?.div || []), 'className', 'id'],
    section: [...(defaultSchema.attributes?.section || []), 'className'],
    p: [...(defaultSchema.attributes?.p || []), 'className'],
    svg: ['className', 'viewBox', 'version', 'width', 'height', 'ariaHidden'],
    path: ['d'],
  },
}

const darkCodeThemeIds = new Set([
  'catppuccin-frappe',
  'catppuccin-macchiato',
  'catppuccin-mocha',
  'kimbie-dark',
  'panda-syntax-dark',
  'paraiso-dark',
  'rose-pine',
  'tokyo-night-dark',
])

function createProcessor({ enableFootnoteLinks, openLinksInNewWindow, platform = 'html', footnoteLabel = 'Footnotes', referenceTitle = 'References' }: ProcessorOptions) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkMermaid)
    .use(remarkFrontmatter, ['yaml', 'toml'])
    .use(remarkFrontmatterTable)
    .use(remarkRehype, {
      allowDangerousHtml: true,
      footnoteLabel,
      footnoteLabelTagName: 'h4',
    })

  if (openLinksInNewWindow) {
    processor.use(rehypeExternalLinks, {
      target: '_blank',
      rel: ['noreferrer', 'noopener'],
    })
  }

  processor
    .use(rehypeRaw)
    .use(rehypeGithubAlert)
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeKatex)
    .use(rehypeHighlight)
    .use(rehypeFigureWrapper)

  if (enableFootnoteLinks && platform !== 'wechat') {
    processor.use(rehypeFootnoteLinks, { referenceTitle })
  }

  const adapterPlugins = getAdapterPlugins(platform, { enableFootnoteLinks, referenceTitle })
  for (const plugin of adapterPlugins) {
    if (Array.isArray(plugin)) {
      processor.use(plugin[0] as Plugin, plugin[1])
    }
    else {
      processor.use(plugin as Plugin)
    }
  }

  processor.use(rehypeDivToSection)
  processor.use(rehypeWrapTextNodes)

  processor.use(rehypeStringify, { allowDangerousHtml: true })

  return processor
}

export function composeRenderCss({ markdownStyle, markdownStyleCss = '', codeThemeCss = '', katexCss = '', customCss = '' }: ComposeCssOptions): string {
  const baseCss = markdownStyle === 'kiko'
    ? [codeThemeCss, markdownStyleCss, katexCss, customCss]
    : [markdownStyleCss, codeThemeCss, katexCss, customCss]

  return baseCss.filter(Boolean).join('\n')
}

export async function render(options: RenderOptions): Promise<string> {
  const {
    markdown,
    markdownStyle,
    codeTheme,
    customCss = '',
    enableFootnoteLinks = true,
    openLinksInNewWindow = true,
    platform = 'html',
    footnoteLabel = 'Footnotes',
    referenceTitle = 'References',
  } = options

  const processor = createProcessor({ enableFootnoteLinks, openLinksInNewWindow, platform, footnoteLabel, referenceTitle })
  const html = (await processor.process(markdown)).toString()

  const hasKatex = html.includes('class="katex"')
    || html.includes('class="katex-display"')
    || html.includes('class="katex-mathml"')

  if (!markdownStyle && !codeTheme && !hasKatex && !customCss) {
    return html
  }

  const [markdownStyleCss, codeThemeCss, katexCss] = await Promise.all([
    markdownStyle ? loadMarkdownStyleCss(markdownStyle) : Promise.resolve(''),
    codeTheme ? loadCodeThemeCss(codeTheme) : Promise.resolve(''),
    hasKatex ? loadKatexCss() : Promise.resolve(''),
  ])
  const css = composeRenderCss({
    markdownStyle,
    markdownStyleCss: markdownStyleCss ?? '',
    codeThemeCss: codeThemeCss ?? '',
    katexCss: katexCss ?? '',
    customCss,
  })

  const codeThemeClass = codeTheme && darkCodeThemeIds.has(codeTheme) ? ' class="code-theme-dark"' : ''
  const wrapped = `<section id="bm-md"${codeThemeClass}>${html}</section>`

  try {
    return juice.inlineContent(wrapped, css, {
      inlinePseudoElements: true,
      preserveImportant: true,
    })
  }
  catch (error) {
    console.error('Juice inline error:', error)
    return wrapped
  }
}
