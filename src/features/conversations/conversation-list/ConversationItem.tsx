import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { MoreHorizontal, Pin, PinOff, Trash2 } from 'lucide-react';
import { Shimmer } from '@/shared/design-system/shimmer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/design-system/dropdown-menu';
import { useDeleteConversation, useSetConversationPinned } from '@/features/conversations/session';
import type { ConversationMeta } from '@/features/conversations/session';
import { truncateMiddle } from '@/shared/core/truncate-middle';

const PLACEHOLDER_TITLES = ['New Chat', 'Untitled Chat'];

function isPlaceholderTitle(title: string | null): boolean {
  if (!title || !title.trim()) {
    return true;
  }

  return PLACEHOLDER_TITLES.includes(title.trim());
}

type ConversationItemProps = {
  conversation: ConversationMeta;
  isActive: boolean;
  onDropdownOpenChange: (open: boolean) => void;
};

export function ConversationItem({
  conversation,
  isActive,
  onDropdownOpenChange,
}: ConversationItemProps) {
  const title = conversation.title || 'Untitled Chat';
  const displayTitle = truncateMiddle(title, 32);
  const useShimmer = isPlaceholderTitle(conversation.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const deleteMutation = useDeleteConversation();
  const pinMutation = useSetConversationPinned();

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
  };

  const handleMenuClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDelete = () => {
    const confirmed = window.confirm('Delete this conversation? This action cannot be undone.');
    if (!confirmed) return;

    deleteMutation.mutate(conversation.id);

    if (isActive) {
      navigate({ to: '/app' });
    }
  };

  const handleSetPinned = (pinned: boolean) => {
    pinMutation.mutate({ id: conversation.id, pinned });
  };

  const handleMenuOpenChange = (open: boolean) => {
    setMenuOpen(open);
    onDropdownOpenChange(open);
  };

  useEffect(() => {
    return () => {
      onDropdownOpenChange(false);
    };
  }, [onDropdownOpenChange]);

  return (
    <div
      className={`group relative flex-col w-full items-start justify-center gap-3 rounded-sm p-0.5 text-left transition-all  ${
        isActive ? 'bg-(--surface-active)' : 'bg-transparent hover:bg-(--surface-hover)'
      }`}
    >
      <Link
        to='/app/c/$conversationId'
        params={{ conversationId: conversation.id }}
        onClick={handleClick}
        className='absolute inset-0 z-0'
        aria-label={title}
      />
      <div className='flex w-full items-center justify-between gap-3 px-1'>
        <div className='pointer-events-none relative z-10 min-w-0 flex-1'>
          <div className='flex min-w-0 items-center gap-2'>
            {conversation.is_pinned ? (
              <Pin className='size-3.5 shrink-0 text-(--text-tertiary)' />
            ) : null}
            <span className='min-w-0 flex-1' title={title}>
              {useShimmer ? (
                <Shimmer
                  as='span'
                  className='block text-sm font-medium text-(--text-secondary)'
                >
                  {displayTitle}
                </Shimmer>
              ) : (
                <span className='block text-sm font-medium text-(--text-secondary)'>
                  {displayTitle}
                </span>
              )}
            </span>
          </div>
        </div>
        <div className='relative z-20'>
          <DropdownMenu modal={false} open={menuOpen} onOpenChange={handleMenuOpenChange}>
            <DropdownMenuTrigger asChild>
              <button
                type='button'
                onClick={handleMenuClick}
                aria-label='Conversation actions'
                className='flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-100 transition-opacity hover:bg-(--surface-hover) hover:text-foreground md:opacity-0 md:group-hover:opacity-100 data-[state=open]:opacity-100'
              >
                <MoreHorizontal className='size-4' />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align='end'
              side='right'
              className='min-w-34'
              onClick={(event) => event.stopPropagation()}
            >
              <DropdownMenuItem
                onSelect={() => {
                  handleSetPinned(!conversation.is_pinned);
                }}
              >
                {conversation.is_pinned ? (
                  <PinOff className='size-4' />
                ) : (
                  <Pin className='size-4' />
                )}
                {conversation.is_pinned ? 'Unpin' : 'Pin'}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  handleDelete();
                }}
                variant='destructive'
              >
                <Trash2 className='size-4' />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
