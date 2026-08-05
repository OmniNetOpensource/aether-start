import { Folder, FolderOpen } from 'lucide-react';
import { Button } from '@/shared/design-system/button';
import { cn } from '@/shared/core/utils';
import type { ChatSessionState } from '@/features/conversations/session';

export function ArtifactToggleButton({
  session,
  onOpenChange,
}: {
  session: ChatSessionState;
  onOpenChange: (open: boolean) => void;
}) {
  const { artifacts, artifactPanelOpen } = session;

  if (artifacts.length === 0) {
    return null;
  }

  return (
    <Button
      type='button'
      variant='ghost'
      size='icon-lg'
      className={cn('rounded-lg', artifactPanelOpen && 'bg-hover text-foreground')}
      aria-label={artifactPanelOpen ? 'Close artifacts' : 'Open artifacts'}
      title={artifactPanelOpen ? 'Close artifacts' : 'Open artifacts'}
      onClick={() => onOpenChange(!artifactPanelOpen)}
    >
      {artifactPanelOpen ? <FolderOpen className='h-5 w-5' /> : <Folder className='h-5 w-5' />}
    </Button>
  );
}
