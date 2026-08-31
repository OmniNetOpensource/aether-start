import { getRouteApi } from '@tanstack/react-router';
import { Check, ChevronDown, MessageSquareText } from '@/frontend/design-system/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/frontend/design-system/dropdown-menu';
import { Button } from '@/frontend/design-system/button';
import { cn } from '@/shared/core/utils';
import {
  setCurrentPromptId,
  useCurrentPromptId,
} from '@/frontend/conversations/session/chat-selection';

const appRoute = getRouteApi('/app');

export function PromptSelector() {
  const loaderData = appRoute.useLoaderData();
  const availablePrompts: { id: string; name: string }[] = loaderData.availablePrompts;
  const currentPromptId = useCurrentPromptId();

  const selectedPromptId = availablePrompts.some((prompt) => prompt.id === currentPromptId)
    ? currentPromptId
    : availablePrompts[0]?.id;

  const currentPromptName =
    availablePrompts.find((prompt) => prompt.id === selectedPromptId)?.name ?? 'aether';

  const toolButtonBaseClass =
    'h-7 gap-1.5 rounded-full px-2.5 text-xs font-medium text-foreground hover:!text-foreground';

  return (
    <DropdownMenu positioning={{ placement: 'bottom-start', gutter: 4 }}>
      <DropdownMenuTrigger
        asChild={(triggerProps) => (
          <Button
            {...triggerProps}
            type='button'
            variant='ghost'
            size='sm'
            aria-label={`选择提示词，当前为 ${currentPromptName}`}
            title={currentPromptName}
            className={cn(
              toolButtonBaseClass,
              'w-8 px-0 @[921px]:w-auto @[921px]:px-2.5 group data-[state=open]:bg-hover data-[state=open]:text-foreground',
            )}
          >
            <MessageSquareText className='h-3.5 w-3.5' />
            <span className='hidden @[921px]:inline-flex items-center gap-1.5'>
              <span className='max-w-20 truncate'>{currentPromptName}</span>
              <ChevronDown className='h-3 w-3 transition-transform duration-300' />
            </span>
          </Button>
        )}
      />
      <DropdownMenuContent>
        {availablePrompts.map((prompt) => (
          <DropdownMenuItem
            key={prompt.id}
            value={prompt.id}
            onSelect={() => setCurrentPromptId(prompt.id)}
          >
            <span className='flex-1 truncate'>{prompt.name}</span>
            {selectedPromptId === prompt.id && <Check className='h-4 w-4 shrink-0' />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
