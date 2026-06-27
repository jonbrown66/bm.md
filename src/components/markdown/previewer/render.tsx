/* eslint-disable react-dom/no-unsafe-iframe-sandbox -- 预览 iframe 需要同源 DOM 访问和脚本执行来渲染 Mermaid 与同步内容。 */
import { debounce } from 'es-toolkit'
import morphdom from 'morphdom'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef } from 'react'
import { usePreviewScrollSync } from '@/components/markdown/hooks/use-scroll-sync'
import { Phone } from '@/components/mockups/iphone'
import { Safari } from '@/components/mockups/safari'
import { mermaidConfig } from '@/config/mermaid'
import { getMarkdownLocaleTexts } from '@/lib/locale'
import { useEditorStore } from '@/stores/editor'
import { useFilesStore } from '@/stores/files'
import { PREVIEW_WIDTH_MOBILE, usePreviewStore } from '@/stores/preview'

import iframeShell from './iframe-shell.html?raw'

const RENDER_DEBOUNCE_MS = 100

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null

async function loadMermaid() {
  mermaidPromise ??= import('mermaid').then((mod) => {
    mod.default.initialize(mermaidConfig)
    return mod.default
  })

  return mermaidPromise
}

async function renderMermaidNodes(nodes: HTMLElement[], iframeDoc: Document | null | undefined) {
  if (nodes.length === 0) {
    return
  }

  const mermaid = await loadMermaid()

  await Promise.all(nodes.map(async (node, index) => {
    try {
      const id = `mermaid-${Date.now()}-${index}`
      const text = node.textContent || ''
      const { svg } = await mermaid.render(id, text)
      node.innerHTML = svg
      node.setAttribute('data-processed', 'true')
    }
    catch (error) {
      console.error('Mermaid render error:', error)
      node.innerHTML = `<p class="text-red-500 font-mono text-sm p-2 bg-red-50 rounded">${error instanceof Error ? error.message : String(error)}</p>`
    }
  }))

  if (!iframeDoc) {
    return
  }

  const parentStyles = document.querySelectorAll('style[id^="mermaid"]')
  parentStyles.forEach((style) => {
    if (!iframeDoc.head.querySelector(`style[id="${style.id}"]`)) {
      iframeDoc.head.appendChild(style.cloneNode(true))
    }
  })
}

export default function MarkdownRender() {
  const content = useFilesStore(state => state.currentContent)
  const deferredContent = useDeferredValue(content)
  const enableScrollSync = useEditorStore(state => state.enableScrollSync)
  const enableFootnoteLinks = useEditorStore(state => state.enableFootnoteLinks)
  const openLinksInNewWindow = useEditorStore(state => state.openLinksInNewWindow)
  const previewWidth = usePreviewStore(state => state.previewWidth)
  const markdownStyle = usePreviewStore(state => state.markdownStyle)
  const codeTheme = usePreviewStore(state => state.codeTheme)
  const customCss = usePreviewStore(state => state.customCss)
  const renderedHtml = usePreviewStore(state => state.getRenderedHtml('html'))
  const setRenderedHtml = usePreviewStore(state => state.setRenderedHtml)

  const { iframeRef, onIframeLoad: onScrollSyncLoad } = usePreviewScrollSync({
    enabled: enableScrollSync,
  })

  const iframeReadyRef = useRef(false)
  const pendingHtmlRef = useRef<string | null>(null)
  const renderSeqRef = useRef(0)
  const renderedHtmlRef = useRef(renderedHtml)

  useEffect(() => {
    renderedHtmlRef.current = renderedHtml
  }, [renderedHtml])

  const updateIframeContent = useCallback((html: string) => {
    const iframe = iframeRef.current
    const body = iframe?.contentDocument?.body

    if (!body) {
      pendingHtmlRef.current = html
      return
    }

    const wrapper = document.createElement('body')
    wrapper.innerHTML = html

    morphdom(body, wrapper, {
      childrenOnly: true,
      onBeforeElUpdated(fromEl, toEl) {
        if (fromEl.isEqualNode(toEl)) {
          return false
        }
        return true
      },
      onElUpdated(el) {
        if (el.classList.contains('mermaid')) {
          el.removeAttribute('data-processed')
        }
      },
    })

    const nodes = Array.from(body.querySelectorAll('.mermaid:not([data-processed="true"])')) as HTMLElement[]
    void renderMermaidNodes(nodes, iframe.contentDocument)
  }, [iframeRef])

  const onIframeLoad = useCallback(() => {
    iframeReadyRef.current = true
    onScrollSyncLoad()

    const htmlToRender = pendingHtmlRef.current ?? renderedHtmlRef.current
    if (htmlToRender) {
      updateIframeContent(htmlToRender)
      pendingHtmlRef.current = null
    }

    const iframeDoc = iframeRef.current?.contentDocument
    if (iframeDoc) {
      iframeDoc.addEventListener('click', (e: MouseEvent) => {
        const link = (e.target as HTMLElement).closest('a')
        if (!link)
          return

        const href = link.getAttribute('href')
        if (!href)
          return

        e.preventDefault()

        if (href.startsWith('#')) {
          let targetHref = href
          if (href.includes('-fnref-')) {
            targetHref = href.replace('-fnref-', '-fn-')
          }
          else if (href.includes('-fn-')) {
            targetHref = href.replace('-fn-', '-fnref-')
          }
          const target = iframeDoc.querySelector(`[href="${CSS.escape(targetHref)}"]`)
          if (target) {
            target.scrollIntoView({ behavior: 'auto' })
          }
          return
        }

        window.open(href, '_blank', 'noopener')
      })
    }
  }, [onScrollSyncLoad, updateIframeContent, iframeRef])

  useEffect(() => {
    if (!renderedHtml) {
      return
    }

    if (iframeReadyRef.current) {
      updateIframeContent(renderedHtml)
    }
    else {
      pendingHtmlRef.current = renderedHtml
    }
  }, [renderedHtml, updateIframeContent])

  const scheduleRender = useMemo(
    () => debounce(async (
      seq: number,
      nextContent: string,
      styleId: string,
      themeId: string,
      customCssValue: string,
      enableRefLinks: boolean,
      openNewWin: boolean,
    ) => {
      try {
        const { markdown } = await import('@/lib/markdown/browser')
        const result = await markdown.render({
          markdown: nextContent,
          markdownStyle: styleId,
          codeTheme: themeId,
          customCss: customCssValue,
          enableFootnoteLinks: enableRefLinks,
          openLinksInNewWindow: openNewWin,
          ...getMarkdownLocaleTexts(),
        })

        if (seq === renderSeqRef.current) {
          setRenderedHtml('html', result.result)
        }
      }
      catch (error) {
        if (seq === renderSeqRef.current) {
          const message = error instanceof Error ? error.message : '转换失败'
          setRenderedHtml('html', message)
        }
      }
    }, RENDER_DEBOUNCE_MS),
    [setRenderedHtml],
  )

  useEffect(() => {
    const seq = renderSeqRef.current + 1
    renderSeqRef.current = seq
    scheduleRender(seq, deferredContent, markdownStyle, codeTheme, customCss, enableFootnoteLinks, openLinksInNewWindow)

    return () => {
      scheduleRender.cancel()
    }
  }, [deferredContent, markdownStyle, codeTheme, customCss, enableFootnoteLinks, openLinksInNewWindow, scheduleRender])

  const isMobile = previewWidth === PREVIEW_WIDTH_MOBILE

  const iframeContent = (
    <iframe
      ref={iframeRef}
      id="bm-preview-iframe"
      title="markdown preview"
      className="h-full w-full border-0"
      sandbox="allow-same-origin allow-modals allow-scripts"
      srcDoc={iframeShell}
      onLoad={onIframeLoad}
    />
  )

  if (isMobile) {
    return (
      <Phone>
        {iframeContent}
      </Phone>
    )
  }

  return (
    <Safari
      className="h-full w-full"
      style={{ maxWidth: previewWidth }}
      url="bm.md"
      mode="simple"
    >
      {iframeContent}
    </Safari>
  )
}
