import type { MermaidConfig } from 'mermaid'

export const mermaidConfig: MermaidConfig = {
  startOnLoad: false,
  theme: 'base',
  themeVariables: {
    primaryColor: '#e8eef8',
    primaryTextColor: '#24364b',
    secondaryColor: '#e7f1eb',
    secondaryTextColor: '#29473a',
    tertiaryColor: '#f5ecdf',
    tertiaryTextColor: '#59412f',
    textColor: '#273444',
    nodeTextColor: '#273444',
    mainBkg: '#fffefb',
    nodeBorder: '#bcc9d8',
    clusterBkg: '#f7f8fa',
    clusterBorder: '#d8dde5',
    lineColor: '#8290a3',
    fontFamily: 'Inter, "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif',
    fontSize: '18px',
  },
  flowchart: {
    htmlLabels: true,
    curve: 'bumpX',
    padding: 18,
    nodeSpacing: 42,
    rankSpacing: 34,
  },
  securityLevel: 'loose',
}
