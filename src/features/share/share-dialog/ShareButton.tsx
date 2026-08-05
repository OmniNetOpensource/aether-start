import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { Button } from '@/shared/design-system/button';
import type { ChatSessionState } from '@/features/conversations/session';
import type { ChatStatus } from '@/features/chat/agent-runtime/chat-runtime-state';
import { ShareDialog } from './ShareDialog';

export function ShareButton({
  session,
  status,
}: {
  session: ChatSessionState;
  status: ChatStatus;
}) {
  const [open, setOpen] = useState(false);
  const { currentPath } = session;
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
        onClick={() => {
          setOpen(true);
        }}
        disabled={isBusy}
      >
        <Share2 className='h-5 w-5' />
      </Button>

      {open ? (
        <ShareDialog open={open} onOpenChange={setOpen} session={session} status={status} />
      ) : null}
    </>
  );
}
