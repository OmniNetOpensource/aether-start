'use client';
import { Check, ChevronDown, MessageSquareText } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAppShellRouteData } from '@/features/sidebar/app-shell-route-data';
import { useChatSessionStore } from '@/features/sidebar/useChatSessionStore';

export function PromptSelector() {
  const appShellData = useAppShellRouteData();
  const currentPrompt = useChatSessionStore((state) => state.currentPrompt);

  const setCurrentPrompt = useChatSessionStore((state) => state.setCurrentPrompt);
  const prompts = appShellData?.availablePrompts ?? [];
  const promptId = appShellData?.initialPromptId ?? 'aether';

  const visiblePrompts = prompts.length > 0 ? prompts : [];
  const selectedPromptId = currentPrompt || promptId;
  const currentPromptName =
    visiblePrompts.find((prompt) => prompt.id === selectedPromptId)?.name ?? 'aether';

  const toolButtonBaseClass =
    'h-7 gap-1.5 rounded-full px-2.5 text-xs font-medium text-(--text-primary) hover:!text-(--text-primary)';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          aria-label={`选择提示词，当前为 ${currentPromptName}`}
          title={currentPromptName}
          className={cn(
            toolButtonBaseClass,
            'w-8 px-0 @[921px]:w-auto @[921px]:px-2.5 group data-[state=open]:bg-(--surface-hover) data-[state=open]:text-foreground',
          )}
        >
          <MessageSquareText className='h-3.5 w-3.5' />
          <span className='hidden @[921px]:inline-flex items-center gap-1.5'>
            <span className='max-w-20 truncate'>{currentPromptName}</span>
            <ChevronDown className='h-3 w-3 transition-transform duration-300' />
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start' sideOffset={4}>
        {visiblePrompts.map((prompt) => (
          <DropdownMenuItem key={prompt.id} onSelect={() => setCurrentPrompt(prompt.id)}>
            <span className='flex-1 truncate'>{prompt.name}</span>
            {selectedPromptId === prompt.id && <Check className='h-4 w-4 shrink-0' />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
