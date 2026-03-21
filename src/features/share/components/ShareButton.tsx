import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatRequestStore } from '@/features/chat/request/useChatRequestStore';
import { useChatSessionStore } from '@/features/sidebar/useChatSessionStore';
import { ShareDialog } from './ShareDialog';

export function ShareButton() {
  const [open, setOpen] = useState(false);
  const currentPath = useChatSessionStore((state) => state.currentPath);
  const status = useChatRequestStore((state) => state.status);
  const isBusy = status !== 'idle';

  if (currentPath.length === 0) {
    return null;
  }

  return (
    <>
      <Button
        type='button'
        variant='ghost'
        size='icon-lg'
        className='rounded-lg'
        aria-label='Share conversation'
        title={
          isBusy ? 'Sharing is unavailable while a response is streaming.' : 'Share conversation'
        }
        onClick={() => setOpen(true)}
        disabled={isBusy}
      >
        <Share2 className='h-5 w-5' />
      </Button>

      <ShareDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
