'use client';

import { useState } from 'react';
import { useMountEffect } from '@/shared/useMountEffect';
import { Bot, Check, ChevronDown } from 'lucide-react';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shared/ui/command';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import { useResponsive } from '@/shared/providers/ResponsiveContext';
import { useAppShellRouteData } from '@/features/sidebar/app-shell-route-data';
import { useChatSessionStore } from '@/features/sidebar/useChatSessionStore';

const MODEL_STORAGE_KEY = 'aether_current_model';

function readStoredModelId(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  return localStorage.getItem(MODEL_STORAGE_KEY) ?? '';
}

export function ModelSelector() {
  const appShellData = useAppShellRouteData();
  const [open, setOpen] = useState(false);
  const currentModelId = useChatSessionStore((state) => state.currentModelId);
  const isMobile = useResponsive() === 'mobile';
  const setCurrentModel = useChatSessionStore((state) => state.setCurrentModel);
  const availableModels = appShellData?.availableModels ?? [];
  const rawStoredModelId = readStoredModelId();
  const storedModelId =
    rawStoredModelId && availableModels.some((m) => m.id === rawStoredModelId)
      ? rawStoredModelId
      : '';
  const selectedModelId =
    currentModelId || appShellData?.initialModelId || storedModelId || availableModels[0]?.id || '';

  const persistModelSelection = (modelId: string) => {
    setCurrentModel(modelId);
    if (typeof window === 'undefined' || !modelId) {
      return;
    }

    localStorage.setItem(MODEL_STORAGE_KEY, modelId);
  };

  const currentModelName = availableModels.find((m) => m.id === selectedModelId)?.name ?? '';

  useMountEffect(() => {
    persistModelSelection(selectedModelId);
  });

  const toolButtonBaseClass =
    'h-7 gap-1.5 rounded-full px-2.5 text-xs font-medium text-foreground hover:!text-foreground';

  return (
    <>
      <Button
        type='button'
        variant='ghost'
        size='sm'
        onClick={() => setOpen(true)}
        aria-label={currentModelName ? `选择模型，当前为 ${currentModelName}` : '选择模型'}
        title={currentModelName || '选择模型'}
        data-testid='model-selector'
        className={cn(
          toolButtonBaseClass,
          'w-8 px-0 @[921px]:w-auto @[921px]:px-2.5 group data-[state=open]:bg-(--surface-hover) data-[state=open]:text-foreground',
        )}
      >
        <span className='flex @[921px]:hidden'>
          <Bot className='h-3.5 w-3.5' />
        </span>
        <span className='hidden @[921px]:flex items-center gap-1.5'>
          <span className='max-w-40 truncate'>{currentModelName}</span>
          <ChevronDown className='h-3 w-3 transition-transform duration-300' />
        </span>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} label='选择模型'>
        <Command className='rounded-lg border-0' loop>
          <CommandInput placeholder='搜索模型...' autoFocus={!isMobile} />
          <CommandList>
            <CommandEmpty>未找到匹配的模型</CommandEmpty>
            {availableModels.map((m) => (
              <CommandItem
                key={m.id}
                value={`${m.id} ${m.name}`}
                onSelect={() => {
                  persistModelSelection(m.id);
                  setOpen(false);
                }}
              >
                <span className='flex-1 truncate'>{m.name}</span>
                {selectedModelId === m.id && <Check className='h-4 w-4 shrink-0' />}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
