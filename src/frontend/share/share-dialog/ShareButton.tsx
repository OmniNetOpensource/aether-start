import { useState } from 'react';
import { Share2 } from '@/frontend/design-system/icons';
import { Button } from '@/frontend/design-system/button';
import { useChatStatus } from '@/frontend/chat/agent-runtime/chat-state';
import { useCurrentPath } from '@/frontend/conversations/conversation-tree/message-tree-state';
import { ShareDialog } from './ShareDialog';

export function ShareButton() {
  const [open, setOpen] = useState(false);
  const status = useChatStatus();
  const currentPath = useCurrentPath();
  const isBusy = status !== 'idle';

  return (
    <>
      {currentPath.length > 0 && (
        <>
          <Button
            type='button'
            variant='ghost'
            size='icon-lg'
            className='rounded-lg'
            aria-label='Share conversation'
            title={
              isBusy
                ? 'Sharing is unavailable while a response is streaming.'
                : 'Share conversation'
            }
            onClick={() => {
              setOpen(true);
            }}
            disabled={isBusy}
          >
            <Share2 className='h-5 w-5' />
          </Button>

          {open ? <ShareDialog open={open} onOpenChange={setOpen} /> : null}
        </>
      )}
    </>
  );
}
