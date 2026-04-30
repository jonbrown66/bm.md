import { CloudUpload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { editorCommandConfig } from '@/config'
import { uploadMarkdownImages } from '@/lib/actions'
import { trackEvent } from '@/lib/analytics'
import { useFilesStore } from '@/stores/files'

export function UploadImagesButton() {
  const content = useFilesStore(state => state.currentContent)
  const setContent = useFilesStore(state => state.setCurrentContent)

  const onUploadClick = () => {
    trackEvent('editor', 'upload_images', 'button')
    void uploadMarkdownImages(content, setContent)
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
          >
            <CloudUpload className="size-4" />
          </Button>
        )}
      />
      <TooltipContent>{editorCommandConfig.uploadImages.label}</TooltipContent>
    </Tooltip>
  )
}
