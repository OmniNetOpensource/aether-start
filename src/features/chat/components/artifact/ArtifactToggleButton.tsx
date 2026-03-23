import { Folder, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useChatSessionStore } from '@/features/sidebar/useChatSessionStore';

export function ArtifactToggleButton() {
  const artifacts = useChatSessionStore((state) => state.artifacts);
  const artifactPanelOpen = useChatSessionStore((state) => state.artifactPanelOpen);
  const setArtifactPanelOpen = useChatSessionStore((state) => state.setArtifactPanelOpen);

  if (artifacts.length === 0) {
    return null;
  }

  return (
    <Button
      type='button'
      variant='ghost'
      size='icon-lg'
      className={cn('rounded-lg', artifactPanelOpen && 'bg-(--surface-hover) text-foreground')}
      aria-label={artifactPanelOpen ? 'Close artifacts' : 'Open artifacts'}
      title={artifactPanelOpen ? 'Close artifacts' : 'Open artifacts'}
      onClick={() => setArtifactPanelOpen(!artifactPanelOpen)}
    >
      {artifactPanelOpen ? <FolderOpen className='h-5 w-5' /> : <Folder className='h-5 w-5' />}
    </Button>
  );
}
