import type { Platform } from '@/lib/markdown/render/adapters'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_MARKDOWN_STYLE_ID, markdownStyleIds } from '@/themes/markdown-style'

export const PREVIEW_WIDTH_MOBILE = 415
export const PREVIEW_WIDTH_DESKTOP = 768

type PreviewWidth = typeof PREVIEW_WIDTH_MOBILE | typeof PREVIEW_WIDTH_DESKTOP
export type PreviewMode = 'mobile' | 'desktop' | 'xhs'
export type XhsPaginationMode = 'auto-height' | 'semantic-block'

export function normalizePreviewMarkdownStyle(markdownStyle: unknown) {
  return typeof markdownStyle === 'string' && markdownStyleIds.includes(markdownStyle)
    ? markdownStyle
    : DEFAULT_MARKDOWN_STYLE_ID
}

function isPreviewMarkdownStyle(markdownStyle: string) {
  return markdownStyleIds.includes(markdownStyle)
}

interface PreviewState {
  previewMode: PreviewMode
  setPreviewMode: (mode: PreviewMode) => void

  previewWidth: PreviewWidth
  setPreviewWidth: (width: PreviewWidth) => void

  userPreferredWidth: PreviewWidth
  setUserPreferredWidth: (width: PreviewWidth) => void

  xhsPaginationMode: XhsPaginationMode
  setXhsPaginationMode: (mode: XhsPaginationMode) => void

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

  xhsFontSize: number
  setXhsFontSize: (size: number) => void
  xhsLineHeight: number
  setXhsLineHeight: (height: number) => void
  xhsPadding: number
  setXhsPadding: (padding: number) => void
  xhsFontFamily: string
  setXhsFontFamily: (family: string) => void
  xhsAuthorName: string
  setXhsAuthorName: (author: string) => void
  xhsShowFooter: boolean
  setXhsShowFooter: (show: boolean) => void
}

export const usePreviewStore = create<PreviewState>()(
  persist(
    (set, get) => ({
      previewMode: 'mobile',
      setPreviewMode: previewMode => set(() => {
        if (previewMode === 'xhs') {
          return { previewMode }
        }

        const previewWidth = previewMode === 'mobile'
          ? PREVIEW_WIDTH_MOBILE
          : PREVIEW_WIDTH_DESKTOP

        return {
          previewMode,
          previewWidth,
          userPreferredWidth: previewWidth,
        }
      }),

      previewWidth: PREVIEW_WIDTH_MOBILE,
      setPreviewWidth: previewWidth => set({ previewWidth }),

      userPreferredWidth: PREVIEW_WIDTH_MOBILE,
      setUserPreferredWidth: userPreferredWidth => set({
        previewMode: userPreferredWidth === PREVIEW_WIDTH_MOBILE ? 'mobile' : 'desktop',
        previewWidth: userPreferredWidth,
        userPreferredWidth,
      }),

      xhsPaginationMode: 'semantic-block',
      setXhsPaginationMode: xhsPaginationMode => set({ xhsPaginationMode }),

      markdownStyle: DEFAULT_MARKDOWN_STYLE_ID,
      setMarkdownStyle: markdownStyle => set((state) => {
        if (!isPreviewMarkdownStyle(markdownStyle) || state.markdownStyle === markdownStyle) {
          return {}
        }

        return { markdownStyle, renderedHtmlMap: {} }
      }),

      codeTheme: 'kimbie-light',
      setCodeTheme: codeTheme => set({ codeTheme, renderedHtmlMap: {} }),

      customCss: '',
      setCustomCss: customCss => set({ customCss, renderedHtmlMap: {} }),

      xhsFontSize: 12.5,
      setXhsFontSize: xhsFontSize => set({ xhsFontSize }),
      xhsLineHeight: 1.55,
      setXhsLineHeight: xhsLineHeight => set({ xhsLineHeight }),
      xhsPadding: 28,
      setXhsPadding: xhsPadding => set({ xhsPadding }),
      xhsFontFamily: 'sans-serif',
      setXhsFontFamily: xhsFontFamily => set({ xhsFontFamily }),
      xhsAuthorName: '',
      setXhsAuthorName: xhsAuthorName => set({ xhsAuthorName }),
      xhsShowFooter: true,
      setXhsShowFooter: xhsShowFooter => set({ xhsShowFooter }),

      renderedHtmlMap: {},
      setRenderedHtml: (platform, html) => set((state) => {
        if (state.renderedHtmlMap[platform] === html) {
          return state
        }

        return {
          renderedHtmlMap: { ...state.renderedHtmlMap, [platform]: html },
        }
      }),
      getRenderedHtml: platform => get().renderedHtmlMap[platform] ?? '',
      clearRenderedHtmlCache: () => set({ renderedHtmlMap: {} }),
    }),
    {
      name: 'bm.md.preview',
      partialize: state => ({
        previewMode: state.previewMode,
        userPreferredWidth: state.userPreferredWidth,
        xhsPaginationMode: state.xhsPaginationMode,
        markdownStyle: normalizePreviewMarkdownStyle(state.markdownStyle),
        codeTheme: state.codeTheme,
        customCss: state.customCss,
        xhsFontSize: state.xhsFontSize,
        xhsLineHeight: state.xhsLineHeight,
        xhsPadding: state.xhsPadding,
        xhsFontFamily: state.xhsFontFamily,
        xhsAuthorName: state.xhsAuthorName,
        xhsShowFooter: state.xhsShowFooter,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<PreviewState> | undefined

        return {
          ...currentState,
          ...persisted,
          previewMode: persisted?.previewMode ?? currentState.previewMode,
          xhsPaginationMode: persisted?.xhsPaginationMode ?? currentState.xhsPaginationMode,
          markdownStyle: normalizePreviewMarkdownStyle(persisted?.markdownStyle),
          xhsFontSize: persisted?.xhsFontSize ?? currentState.xhsFontSize,
          xhsLineHeight: persisted?.xhsLineHeight ?? currentState.xhsLineHeight,
          xhsPadding: persisted?.xhsPadding ?? currentState.xhsPadding,
          xhsFontFamily: persisted?.xhsFontFamily ?? currentState.xhsFontFamily,
          xhsAuthorName: persisted?.xhsAuthorName ?? currentState.xhsAuthorName,
          xhsShowFooter: persisted?.xhsShowFooter ?? currentState.xhsShowFooter,
        }
      },
    },
  ),
)
