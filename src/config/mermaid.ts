import type { MermaidConfig } from 'mermaid'

export const mermaidThemeVariables = {
  // 编辑式信息图配色：暖纸色、墨色、蓝灰连线，以及仅用于注释的单一橙色焦点。
  primaryColor: '#f5f5f5',
  primaryTextColor: '#2d3142',
  primaryBorderColor: '#2d3142',
  secondaryColor: '#ececec',
  secondaryTextColor: '#2d3142',
  secondaryBorderColor: '#bfc0c0',
  tertiaryColor: '#f5f5f5',
  tertiaryTextColor: '#2d3142',
  tertiaryBorderColor: '#bfc0c0',
  textColor: '#2d3142',
  nodeTextColor: '#2d3142',
  mainBkg: '#f5f5f5',
  nodeBorder: '#2d3142',
  clusterBkg: '#ececec',
  clusterBorder: '#bfc0c0',
  lineColor: '#4f5d75',
  arrowheadColor: '#4f5d75',
  edgeLabelBackground: '#f5f5f5',
  titleColor: '#2d3142',
  labelColor: '#2d3142',
  labelBoxBkgColor: '#f5f5f5',
  labelBoxBorderColor: '#bfc0c0',
  labelTextColor: '#2d3142',
  actorBkg: '#f5f5f5',
  actorBorder: '#2d3142',
  actorTextColor: '#2d3142',
  actorLineColor: '#bfc0c0',
  signalColor: '#4f5d75',
  signalTextColor: '#2d3142',
  noteBkgColor: '#fff1e9',
  noteBorderColor: '#eb6c36',
  noteTextColor: '#2d3142',
  activationBkgColor: '#ececec',
  activationBorderColor: '#4f5d75',
  fontFamily: '"Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif',
  fontSize: '18px',
}

const mermaidEditorialThemeCss = `
  /* 保持 Mermaid 原生结构，只补充低密度的编辑式细节。 */
  .node rect {
    rx: 6px;
    ry: 6px;
  }

  .cluster rect {
    rx: 8px;
    ry: 8px;
  }

  .node .label,
  .nodeLabel,
  .cluster-label {
    font-weight: 600;
  }

  .edgeLabel {
    font-weight: 500;
  }

  .flowchart-link,
  .edgePath .path {
    stroke-linecap: round;
    stroke-linejoin: round;
  }
`

export const mermaidConfig: MermaidConfig = {
  startOnLoad: false,
  theme: 'base',
  themeVariables: mermaidThemeVariables,
  themeCSS: mermaidEditorialThemeCss,
  flowchart: {
    htmlLabels: true,
    curve: 'stepAfter',
    padding: 20,
    nodeSpacing: 40,
    rankSpacing: 40,
  },
  securityLevel: 'loose',
}
