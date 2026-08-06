import { createSignal } from 'solid-js';
import { Share2 } from '@/frontend/design-system/icons';
import { Button } from '@/frontend/design-system/button';
import { status } from '@/frontend/chat/agent-runtime/chat-state';
import { currentPath } from '@/frontend/conversations/conversation-tree/message-tree-state';
import { ShareDialog } from './ShareDialog';

export function ShareButton() {
  const [open, setOpen] = createSignal(false);
  const isBusy = () => status() !== 'idle';

  return (
    <>
      {currentPath().length > 0 && (
        <>
          <Button
            type='button'
            variant='ghost'
            size='icon-lg'
            class='rounded-lg'
            aria-label='Share conversation'
            title={
              isBusy()
                ? 'Sharing is unavailable while a response is streaming.'
                : 'Share conversation'
            }
            onClick={() => {
              setOpen(true);
            }}
            disabled={isBusy()}
          >
            <Share2 class='h-5 w-5' />
          </Button>

          {open() ? <ShareDialog open={open()} onOpenChange={setOpen} /> : null}
        </>
      )}
    </>
  );
}
