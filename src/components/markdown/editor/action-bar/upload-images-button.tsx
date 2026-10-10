import { CloudUpload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { editorCommandConfig } from '@/config'
import { uploadMarkdownImages } from '@/lib/actions'
import { trackEvent } from '@/lib/analytics'
import { useFilesStore } from '@/stores/files'

export function UploadImagesButton() {
  const content = useFilesStore(state => state.currentContent)
  const setContent = useFilesStore(state => state.setCurrentContent)
  const [isUploading, setIsUploading] = useState(false)
  const uploading = useRef(false)

  const onUploadClick = async () => {
    if (uploading.current) {
      return
    }
    uploading.current = true
    setIsUploading(true)
    const fileId = useFilesStore.getState().activeFileId
    trackEvent('editor', 'upload_images', 'button')
    try {
      await uploadMarkdownImages(content, setContent, () => {
        const state = useFilesStore.getState()
        return state.activeFileId === fileId ? state.currentContent : undefined
      })
    }
    finally {
      uploading.current = false
      setIsUploading(false)
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={(
          <Button
            variant="ghost"
            size="icon"
            aria-label={editorCommandConfig.uploadImages.label}
            onClick={onUploadClick}
            disabled={isUploading}
          >
            <CloudUpload className="size-4" />
          </Button>
        )}
      />
      <TooltipContent>{editorCommandConfig.uploadImages.label}</TooltipContent>
    </Tooltip>
  )
}
