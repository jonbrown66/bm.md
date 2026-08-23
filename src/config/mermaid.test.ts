import { describe, expect, it } from 'vitest'
import { mermaidConfig, mermaidThemeVariables } from './mermaid'

describe('mermaid visual configuration', () => {
  it('uses the editorial paper, ink, and single-accent palette', () => {
    expect(mermaidConfig.theme).toBe('base')
    expect(mermaidThemeVariables).toMatchObject({
      mainBkg: '#f5f5f5',
      nodeBorder: '#2d3142',
      lineColor: '#4f5d75',
      noteBorderColor: '#eb6c36',
    })
  })

  it('keeps diagrams flat while adding small, deliberate shape details', () => {
    expect(mermaidConfig.themeCSS).toContain('rx: 6px')
    expect(mermaidConfig.themeCSS).toContain('stroke-linecap: round')
    expect(mermaidConfig.themeCSS).not.toContain('box-shadow')
  })

  it('uses directional flowchart connectors instead of soft curves', () => {
    expect(mermaidConfig.flowchart?.curve).toBe('stepAfter')
  })
})
