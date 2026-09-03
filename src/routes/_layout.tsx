import { ClientOnly, createFileRoute, Outlet } from '@tanstack/react-router'
import { lazy, useEffect } from 'react'
import MarkdownEditor from '@/components/markdown/editor'
import { FooterBar } from '@/components/markdown/footer-bar'
import MarkdownPreviewer from '@/components/markdown/previewer'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { useFilesSync } from '@/hooks/use-files-sync'

export const Route = createFileRoute('/_layout')({ component: App })

const CommandPalette = lazy(() => import('@/components/command-palette').then(mod => ({
  default: mod.CommandPalette,
})))

function App() {
  useFilesSync()

  useEffect(() => {
    const prepareWorker = async () => {
      const { worker } = await import('@/lib/markdown/browser')
      void worker.prepare()
    }

    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(prepareWorker)
      return () => window.cancelIdleCallback(idleId)
    }

    const timeoutId = globalThis.setTimeout(prepareWorker, 1000)
    return () => globalThis.clearTimeout(timeoutId)
  }, [])

  return (
    <div
      className={`
        flex h-screen min-h-[700px] min-w-5xl flex-col overflow-hidden
        supports-[height:100dvh]:h-dvh
      `}
    >
      <ResizablePanelGroup tagName="main" className="flex-1" direction="horizontal">
        <ResizablePanel defaultSize={50} minSize={30} className="min-w-0">
          <MarkdownEditor></MarkdownEditor>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={50} minSize={30} className="min-w-0">
          <MarkdownPreviewer></MarkdownPreviewer>
        </ResizablePanel>
      </ResizablePanelGroup>
      <FooterBar></FooterBar>
      <ClientOnly>
        <CommandPalette />
      </ClientOnly>
      <Outlet />
    </div>
  )
}
