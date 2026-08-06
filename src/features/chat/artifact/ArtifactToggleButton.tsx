import { Folder, FolderOpen } from '@/shared/design-system/icons';
import { Button } from '@/shared/design-system/button';
import { cn } from '@/shared/core/utils';
import { artifactPanelOpen, artifacts, setArtifactPanelOpen } from './artifact-state';

export function ArtifactToggleButton() {
  return (
    <>
      {artifacts().length > 0 && (
        <Button
          type='button'
          variant='ghost'
          size='icon-lg'
          class={cn('rounded-lg', artifactPanelOpen() && 'bg-hover text-foreground')}
          aria-label={artifactPanelOpen() ? 'Close artifacts' : 'Open artifacts'}
          title={artifactPanelOpen() ? 'Close artifacts' : 'Open artifacts'}
          onClick={() => setArtifactPanelOpen(!artifactPanelOpen())}
        >
          {artifactPanelOpen() ? <FolderOpen class='h-5 w-5' /> : <Folder class='h-5 w-5' />}
        </Button>
      )}
    </>
  );
}
