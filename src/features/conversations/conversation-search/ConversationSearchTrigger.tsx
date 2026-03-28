import { useState } from 'react';
import { Search } from 'lucide-react';
import { ConversationSearchDialog } from './ConversationSearchDialog';
import { Button } from '@/shared/design-system/button';

type ConversationSearchTriggerProps = {
  variant?: 'sidebar' | 'icon';
};

export function ConversationSearchTrigger({ variant = 'icon' }: ConversationSearchTriggerProps) {
  const [open, setOpen] = useState(false);
  const isSidebar = variant === 'sidebar';

  return (
    <>
      <Button
        type='button'
        variant='ghost'
        size={isSidebar ? 'default' : 'icon-lg'}
        className={
          isSidebar
            ? 'group relative h-10 w-full justify-start overflow-hidden rounded-md border px-3 transition-all duration-300 ink-border bg-transparent text-(--text-secondary) hover:bg-(--surface-hover) hover:text-(--text-primary)'
            : 'rounded-lg'
        }
        aria-label='搜索聊天记录'
        title='搜索聊天记录'
        onClick={() => setOpen(true)}
      >
        {isSidebar ? (
          <>
            <span className='flex h-10 w-10 shrink-0 items-center justify-center'>
              <Search className='h-5 w-5' />
            </span>
            <span className='overflow-hidden whitespace-nowrap text-sm font-medium transition-all duration-500'>
              搜索聊天记录
            </span>
          </>
        ) : (
          <Search className='h-5 w-5' />
        )}
      </Button>

      <ConversationSearchDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
