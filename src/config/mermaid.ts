import type { MermaidConfig } from 'mermaid'

export const mermaidConfig: MermaidConfig = {
  startOnLoad: false,
  theme: 'base',
  themeVariables: {
    primaryColor: '#FF6B6B',
    primaryTextColor: '#000000', // Black text
    secondaryColor: '#4ECDC4',
    secondaryTextColor: '#000000',
    tertiaryColor: '#45B7D1',
    tertiaryTextColor: '#000000',
    textColor: '#000000',
    nodeTextColor: '#000000',
    mainBkg: '#FFFFFF',
    nodeBorder: '#000000', // Black borders
    clusterBkg: '#F5F5F5', // Light gray cluster background
    clusterBorder: '#000000',
    lineColor: '#000000',
    fontFamily: '"Inter", "Segoe UI", sans-serif',
    fontSize: '16px', // Larger font
  },
  flowchart: {
    htmlLabels: true,
    curve: 'basis',
    padding: 15,
    nodeSpacing: 30, // Tighter spacing
    rankSpacing: 40,
  },
  securityLevel: 'loose',
}
