'use client';
import { useEffect } from 'react';
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

export function PromptSelector() {
  const appShellData = useAppShellRouteData();

  const setCurrentPrompt = useChatSessionStore((state) => state.setCurrentPrompt);
  const currentPromptId = useChatSessionStore((state) => state.currentPromptId);
  const prompts = appShellData?.availablePrompts ?? [];
  // 持久化优先：currentPromptId 由 persist 中间件 hydrate；loader 仅在首次访问兜底。
  const storedIsValid = prompts.some((p) => p.id === currentPromptId);
  const selectedPromptId = storedIsValid
    ? currentPromptId
    : appShellData?.initialPromptId || prompts[0]?.id || 'aether';

  // 回灌兜底值，使下游读 store 的代码拿到稳定 id。
  useEffect(() => {
    if (selectedPromptId && selectedPromptId !== currentPromptId) {
      setCurrentPrompt(selectedPromptId);
    }
  }, [selectedPromptId, currentPromptId, setCurrentPrompt]);

  const currentPromptName =
    prompts.find((prompt) => prompt.id === selectedPromptId)?.name ?? 'aether';

  const toolButtonBaseClass =
    'h-7 gap-1.5 rounded-full px-2.5 text-xs font-medium text-foreground hover:!text-foreground';

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
            'w-8 px-0 @[921px]:w-auto @[921px]:px-2.5 group data-[state=open]:bg-hover data-[state=open]:text-foreground',
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
          <DropdownMenuItem key={prompt.id} onSelect={() => setCurrentPrompt(prompt.id)}>
            <span className='flex-1 truncate'>{prompt.name}</span>
            {selectedPromptId === prompt.id && <Check className='h-4 w-4 shrink-0' />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
