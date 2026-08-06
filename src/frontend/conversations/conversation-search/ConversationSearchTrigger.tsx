import { createSignal } from 'solid-js';
import { Search } from '@/frontend/design-system/icons';
import { ConversationSearchDialog } from './ConversationSearchDialog';
import { Button } from '@/frontend/design-system/button';

type ConversationSearchTriggerProps = {
  variant?: 'sidebar' | 'icon';
};

export function ConversationSearchTrigger(props: ConversationSearchTriggerProps) {
  const [open, setOpen] = createSignal(false);
  const isSidebar = () => (props.variant ?? 'icon') === 'sidebar';

  return (
    <>
      <Button
        type='button'
        variant='ghost'
        size={isSidebar() ? 'default' : 'icon-lg'}
        class={
          isSidebar()
            ? 'group relative h-10 w-full justify-start overflow-hidden rounded-md border px-3 transition-all duration-300 bg-transparent text-secondary hover:bg-hover hover:text-foreground'
            : 'rounded-lg'
        }
        aria-label='搜索聊天记录'
        title='搜索聊天记录'
        onClick={() => setOpen(true)}
      >
        {isSidebar() ? (
          <>
            <span class='flex h-10 w-10 shrink-0 items-center justify-center'>
              <Search class='h-5 w-5' />
            </span>
            <span class='overflow-hidden whitespace-nowrap text-sm font-medium transition-all duration-500'>
              搜索聊天记录
            </span>
          </>
        ) : (
          <Search class='h-5 w-5' />
        )}
      </Button>

      <ConversationSearchDialog open={open()} onOpenChange={setOpen} />
    </>
  );
}
