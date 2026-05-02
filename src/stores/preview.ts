import type { Platform } from '@/lib/markdown/render/adapters'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_MARKDOWN_STYLE_ID, markdownStyleIds } from '@/themes/markdown-style'

export const PREVIEW_WIDTH_MOBILE = 415
export const PREVIEW_WIDTH_DESKTOP = 768

type PreviewWidth = typeof PREVIEW_WIDTH_MOBILE | typeof PREVIEW_WIDTH_DESKTOP

export function normalizePreviewMarkdownStyle(markdownStyle: unknown) {
  return typeof markdownStyle === 'string' && markdownStyleIds.includes(markdownStyle)
    ? markdownStyle
    : DEFAULT_MARKDOWN_STYLE_ID
}

interface PreviewState {
  previewWidth: PreviewWidth
  setPreviewWidth: (width: PreviewWidth) => void

  userPreferredWidth: PreviewWidth
  setUserPreferredWidth: (width: PreviewWidth) => void

  markdownStyle: string
  setMarkdownStyle: (id: string) => void

  codeTheme: string
  setCodeTheme: (theme: string) => void

  customCss: string
  setCustomCss: (css: string) => void

  renderedHtmlMap: Partial<Record<Platform, string>>
  setRenderedHtml: (platform: Platform, html: string) => void
  getRenderedHtml: (platform: Platform) => string
  clearRenderedHtmlCache: () => void
}

export const usePreviewStore = create<PreviewState>()(
  persist(
    (set, get) => ({
      previewWidth: PREVIEW_WIDTH_MOBILE,
      setPreviewWidth: previewWidth => set({ previewWidth }),

      userPreferredWidth: PREVIEW_WIDTH_MOBILE,
      setUserPreferredWidth: userPreferredWidth => set({ previewWidth: userPreferredWidth, userPreferredWidth }),

      markdownStyle: DEFAULT_MARKDOWN_STYLE_ID,
      setMarkdownStyle: markdownStyle => set({ markdownStyle, renderedHtmlMap: {} }),

      codeTheme: 'kimbie-light',
      setCodeTheme: codeTheme => set({ codeTheme, renderedHtmlMap: {} }),

      customCss: '',
      setCustomCss: customCss => set({ customCss, renderedHtmlMap: {} }),

      renderedHtmlMap: {},
      setRenderedHtml: (platform, html) => set(state => ({
        renderedHtmlMap: { ...state.renderedHtmlMap, [platform]: html },
      })),
      getRenderedHtml: platform => get().renderedHtmlMap[platform] ?? '',
      clearRenderedHtmlCache: () => set({ renderedHtmlMap: {} }),
    }),
    {
      name: 'bm.md.preview',
      partialize: state => ({
        userPreferredWidth: state.userPreferredWidth,
        markdownStyle: normalizePreviewMarkdownStyle(state.markdownStyle),
        codeTheme: state.codeTheme,
        customCss: state.customCss,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<PreviewState> | undefined

        return {
          ...currentState,
          ...persisted,
          markdownStyle: normalizePreviewMarkdownStyle(persisted?.markdownStyle),
        }
      },
    },
  ),
)
