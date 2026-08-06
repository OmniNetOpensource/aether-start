import { For } from 'solid-js';
import { getRouteApi } from '@tanstack/solid-router';
import { Check, ChevronDown, MessageSquareText } from '@/shared/design-system/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/design-system/dropdown-menu';
import { Button } from '@/shared/design-system/button';
import { cn } from '@/shared/core/utils';
import {
  currentPromptId,
  setCurrentPromptId,
} from '@/features/conversations/session/chat-selection';

const appRoute = getRouteApi('/app');

export function PromptSelector() {
  const loaderData = appRoute.useLoaderData();
  const availablePrompts = () => loaderData().availablePrompts;

  // 持久化优先：currentPromptId 由 persist 中间件 hydrate；loader 仅在首次访问兜底。
  const selectedPromptId = () =>
    availablePrompts().some((prompt) => prompt.id === currentPromptId())
      ? currentPromptId()
      : loaderData().initialPromptId;

  const currentPromptName = () =>
    availablePrompts().find((prompt) => prompt.id === selectedPromptId())?.name ?? 'aether';

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
            aria-label={`选择提示词，当前为 ${currentPromptName()}`}
            title={currentPromptName()}
            class={cn(
              toolButtonBaseClass,
              'w-8 px-0 @[921px]:w-auto @[921px]:px-2.5 group data-[state=open]:bg-hover data-[state=open]:text-foreground',
            )}
          >
            <MessageSquareText class='h-3.5 w-3.5' />
            <span class='hidden @[921px]:inline-flex items-center gap-1.5'>
              <span class='max-w-20 truncate'>{currentPromptName()}</span>
              <ChevronDown class='h-3 w-3 transition-transform duration-300' />
            </span>
          </Button>
        )}
      />
      <DropdownMenuContent>
        <For each={availablePrompts()}>
          {(prompt) => (
            <DropdownMenuItem value={prompt.id} onSelect={() => setCurrentPromptId(prompt.id)}>
              <span class='flex-1 truncate'>{prompt.name}</span>
              {selectedPromptId() === prompt.id && <Check class='h-4 w-4 shrink-0' />}
            </DropdownMenuItem>
          )}
        </For>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
