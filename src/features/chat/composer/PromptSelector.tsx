'use client';
import { Check, ChevronDown, MessageSquareText } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/design-system/dropdown-menu';
import { Button } from '@/shared/design-system/button';
import { cn } from '@/shared/core/utils';
import { useAppShellRouteData } from '@/features/conversations/route-data';
import { useChatSessionStore } from '@/features/conversations/session';
import { useMountEffect } from '@/shared/app-shell/useMountEffect';

const PROMPT_STORAGE_KEY = 'aether_current_prompt';

function readStoredPromptId(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  return localStorage.getItem(PROMPT_STORAGE_KEY) ?? '';
}

export function PromptSelector() {
  const appShellData = useAppShellRouteData();

  const setCurrentPrompt = useChatSessionStore((state) => state.setCurrentPrompt);
  const currentPromptId = useChatSessionStore((state) => state.currentPromptId);
  const prompts = appShellData?.availablePrompts ?? [];
  const rawStoredPromptId = readStoredPromptId();
  const storedPromptId =
    rawStoredPromptId && prompts.some((p) => p.id === rawStoredPromptId) ? rawStoredPromptId : '';
  const selectedPromptId =
    currentPromptId ||
    appShellData?.initialPromptId ||
    storedPromptId ||
    prompts[0]?.id ||
    'aether';

  const persistPromptSelection = (promptId: string) => {
    setCurrentPrompt(promptId);
    if (typeof window === 'undefined' || !promptId) {
      return;
    }

    localStorage.setItem(PROMPT_STORAGE_KEY, promptId);
  };

  const currentPromptName =
    prompts.find((prompt) => prompt.id === selectedPromptId)?.name ?? 'aether';

  useMountEffect(() => {
    persistPromptSelection(selectedPromptId);
  });

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
        {prompts.map((prompt) => (
          <DropdownMenuItem key={prompt.id} onSelect={() => persistPromptSelection(prompt.id)}>
            <span className='flex-1 truncate'>{prompt.name}</span>
            {selectedPromptId === prompt.id && <Check className='h-4 w-4 shrink-0' />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
