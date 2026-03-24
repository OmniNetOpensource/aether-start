import { Suspense, lazy, useState } from 'react';
import { Loader2, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useChatRequestStore } from '@/features/chat/request/useChatRequestStore';
import { useChatSessionStore } from '@/features/sidebar/useChatSessionStore';

let shareDialogModulePromise: Promise<typeof import('./ShareDialog')> | null = null;

const loadShareDialog = () => {
  if (!shareDialogModulePromise) {
    shareDialogModulePromise = import('./ShareDialog');
  }

  return shareDialogModulePromise;
};

const ShareDialog = lazy(async () => {
  const module = await loadShareDialog();

  return {
    default: module.ShareDialog,
  };
});

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
        onPointerEnter={() => {
          void loadShareDialog();
        }}
        onFocus={() => {
          void loadShareDialog();
        }}
        onClick={() => {
          void loadShareDialog();
          setOpen(true);
        }}
        disabled={isBusy}
      >
        <Share2 className='h-5 w-5' />
      </Button>

      {open ? (
        <Suspense
          fallback={
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogContent className='sm:max-w-md'>
                <div className='flex items-center gap-2 py-6 text-sm text-(--text-tertiary)'>
                  <Loader2 className='h-4 w-4 animate-spin' />
                  <span>Loading share tools...</span>
                </div>
              </DialogContent>
            </Dialog>
          }
        >
          <ShareDialog open={open} onOpenChange={setOpen} />
        </Suspense>
      ) : null}
    </>
  );
}
