import { Folder, FolderOpen } from '@/frontend/design-system/icons';
import { Button } from '@/frontend/design-system/button';
import { cn } from '@/shared/core/utils';
import { setArtifactPanelOpen, useArtifactPanelOpen, useArtifacts } from './artifact-state';

export function ArtifactToggleButton() {
  const artifacts = useArtifacts();
  const artifactPanelOpen = useArtifactPanelOpen();

  return (
    <>
      {artifacts.length > 0 && (
        <Button
          type='button'
          variant='ghost'
          size='icon-lg'
          className={cn('rounded-lg', artifactPanelOpen && 'bg-hover text-foreground')}
          aria-label={artifactPanelOpen ? 'Close artifacts' : 'Open artifacts'}
          title={artifactPanelOpen ? 'Close artifacts' : 'Open artifacts'}
          onClick={() => setArtifactPanelOpen(!artifactPanelOpen)}
        >
          {artifactPanelOpen ? <FolderOpen className='h-5 w-5' /> : <Folder className='h-5 w-5' />}
        </Button>
      )}
    </>
  );
}
