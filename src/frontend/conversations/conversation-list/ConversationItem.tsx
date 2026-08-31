import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { MoreHorizontal, Pin, PinOff, Trash2 } from '@/frontend/design-system/icons';
import { Shimmer } from '@/frontend/design-system/shimmer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/frontend/design-system/dropdown-menu';
import { useDeleteConversation, useSetConversationPinned } from '@/frontend/conversations/session';
import type { ConversationMeta } from '@/frontend/conversations/session';
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

export function ConversationItem(props: ConversationItemProps) {
  const onDropdownOpenChange = useRef(props.onDropdownOpenChange);
  const menuOpenRef = useRef(false);
  onDropdownOpenChange.current = props.onDropdownOpenChange;
  const title = props.conversation.title || 'Untitled Chat';
  const displayTitle = truncateMiddle(title, 32);
  const useShimmer = isPlaceholderTitle(props.conversation.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const deleteMutation = useDeleteConversation();
  const pinMutation = useSetConversationPinned();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    void navigate({
      to: '/app/$conversationId',
      params: { conversationId: props.conversation.id },
    }).catch((error) => {
      console.error('Failed to navigate to conversation:', error);
    });
  };

  const handleDelete = () => {
    const confirmed = window.confirm('Delete this conversation? This action cannot be undone.');
    if (!confirmed) return;

    deleteMutation.mutate(props.conversation.id);

    if (props.isActive) {
      void navigate({
        to: '/app',
      }).catch((error) => {
        console.error('Failed to navigate after deleting conversation:', error);
      });
    }
  };

  const handleSetPinned = (pinned: boolean) => {
    pinMutation.mutate({ id: props.conversation.id, pinned });
  };

  const handleMenuOpenChange = (open: boolean) => {
    menuOpenRef.current = open;
    setMenuOpen(open);
    props.onDropdownOpenChange(open);
  };

  useEffect(
    () => () => {
      if (menuOpenRef.current) onDropdownOpenChange.current(false);
    },
    [],
  );

  return (
    <div
      className={`group relative flex-col w-full items-start justify-center gap-3 rounded-sm p-0.5 text-left transition-all  ${
        props.isActive ? 'bg-active' : 'bg-transparent hover:bg-hover'
      }`}
    >
      <div className='flex w-full items-center justify-between gap-3 px-1'>
        <a
          href={`/app/${props.conversation.id}`}
          onClick={handleClick}
          className='min-w-0 flex-1'
          aria-label={title}
        >
          <div className='flex min-w-0 items-center gap-2'>
            {props.conversation.is_pinned ? (
              <Pin className='size-3.5 shrink-0 text-muted-foreground' />
            ) : null}
            <span className='min-w-0 flex-1' title={title}>
              {useShimmer ? (
                <Shimmer as='span' className='block text-sm font-medium text-secondary'>
                  {displayTitle}
                </Shimmer>
              ) : (
                <span className='block text-sm font-medium text-secondary'>{displayTitle}</span>
              )}
            </span>
          </div>
        </a>
        <div className='relative z-20'>
          <DropdownMenu
            open={menuOpen}
            onOpenChange={handleMenuOpenChange}
            positioning={{ placement: 'right-end', gutter: 4 }}
          >
            <DropdownMenuTrigger
              asChild={(triggerProps) => (
                <button
                  {...triggerProps}
                  type='button'
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (typeof triggerProps.onClick === 'function') triggerProps.onClick(event);
                  }}
                  aria-label='Conversation actions'
                  className='flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-100 transition-opacity hover:bg-hover hover:text-foreground md:opacity-0 md:group-hover:opacity-100 data-[state=open]:opacity-100'
                >
                  <MoreHorizontal className='size-4' />
                </button>
              )}
            />
            <DropdownMenuContent className='min-w-34' onClick={(event) => event.stopPropagation()}>
              <DropdownMenuItem
                value='toggle-pin'
                onSelect={() => {
                  handleSetPinned(!props.conversation.is_pinned);
                }}
              >
                {props.conversation.is_pinned ? (
                  <PinOff className='size-4' />
                ) : (
                  <Pin className='size-4' />
                )}
                {props.conversation.is_pinned ? 'Unpin' : 'Pin'}
              </DropdownMenuItem>
              <DropdownMenuItem
                value='delete'
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
