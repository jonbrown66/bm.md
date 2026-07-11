export interface XhsFontOption {
  value: string
  label: string
  fontFamily: string
  fontCssHref?: string
}

export const XHS_FONT_OPTIONS: readonly XhsFontOption[] = [
  {
    value: 'sans-serif',
    label: '默认无衬线',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif',
  },
  {
    value: 'oppo-sans',
    label: 'OPPO Sans',
    fontFamily: '"OPPO Sans", "OPPO Sans 4.0", "OPPO Sans 3.0", OPPOSans, "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif',
    fontCssHref: '/fonts/oppo-sans/font.css',
  },
  {
    value: 'source-han-sans',
    label: '思源黑体',
    fontFamily: '"Source Han Sans SC VF", "Source Han Sans SC", "Noto Sans CJK SC", "Noto Sans SC", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif',
    fontCssHref: '/fonts/source-han-sans-sc-vf/font.css',
  },
  {
    value: 'source-han-serif',
    label: '思源宋体',
    fontFamily: '"Source Han Serif SC VF", "Source Han Serif SC", "Noto Serif CJK SC", "Noto Serif SC", "Songti SC", STSong, SimSun, serif',
    fontCssHref: '/fonts/source-han-serif-sc-vf/font.css',
  },
  {
    value: 'serif',
    label: '优雅宋体（衬线）',
    fontFamily: '"Source Han Serif SC VF", "Noto Serif SC", "Source Han Serif SC", "Songti SC", STSong, SimSun, serif',
  },
  {
    value: 'kaiti',
    label: '现代楷体',
    fontFamily: '"Kaiti SC", STKaiti, KaiTi, "Microsoft KaiTi", serif',
  },
  {
    value: 'monospace',
    label: '等宽字体',
    fontFamily: '"SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
  },
]

const XHS_FONT_OPTION_ALIASES: Record<string, string> = {
  'misans-light': 'oppo-sans',
}

export function getXhsFontOption(value: string) {
  const normalizedValue = XHS_FONT_OPTION_ALIASES[value] ?? value

  return XHS_FONT_OPTIONS.find(option => option.value === normalizedValue) ?? XHS_FONT_OPTIONS[0]
}

export function getXhsTextFlowCss() {
  return `
  letter-spacing: normal;
  text-align: left !important;
  text-wrap: pretty;
`
}
