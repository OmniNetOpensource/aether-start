import { lazy, Suspense, useState } from 'react';
import { GitBranch } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/shared/ui/dialog';
import { useChatRequestStore } from '@/features/chat/request/useChatRequestStore';
import { useChatSessionStore } from '@/features/sidebar/useChatSessionStore';
import { buildOutlineTree } from './build-outline-tree';

const OutlineGraph = lazy(() => import('./OutlineGraph'));

const SCROLL_RETRY_FRAMES = 4;

const scrollToMessage = (messageId: number) => {
  let attempts = 0;
  const tryScroll = () => {
    const el = document.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (attempts++ < SCROLL_RETRY_FRAMES) requestAnimationFrame(tryScroll);
  };
  requestAnimationFrame(tryScroll);
};

export function OutlineButton() {
  const [open, setOpen] = useState(false);
  const messages = useChatSessionStore((s) => s.messages);
  const currentPath = useChatSessionStore((s) => s.currentPath);
  const latestRootId = useChatSessionStore((s) => s.latestRootId);
  const selectMessage = useChatSessionStore((s) => s.selectMessage);
  const isBusy = useChatRequestStore((s) => s.status) !== 'idle';

  const roots = open ? buildOutlineTree(messages, latestRootId).roots : null;

  const handleSelect = (targetMessageId: number) => {
    if (!currentPath.includes(targetMessageId)) selectMessage(targetMessageId);
    setOpen(false);
    scrollToMessage(targetMessageId);
  };

  const hasMessages = currentPath.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          size='icon-sm'
          className='rounded-lg'
          aria-label='Open conversation outline'
          title={
            isBusy
              ? 'Outline is unavailable while a response is streaming.'
              : 'Open conversation outline'
          }
          disabled={!hasMessages || isBusy}
        >
          <GitBranch className='h-4 w-4' />
        </Button>
      </DialogTrigger>
      <DialogContent
        className='w-[min(94vw,72rem)] p-3 sm:max-w-4xl'
        showCloseButton
        data-outline-dialog
      >
        {roots && (
          <Suspense>
            <OutlineGraph
              roots={roots}
              currentPath={currentPath}
              onSelect={handleSelect}
              disabled={isBusy}
            />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  );
}
