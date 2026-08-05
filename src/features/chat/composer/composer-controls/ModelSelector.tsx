'use client';

import { useRef, useState } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Bot, Check, ChevronDown } from 'lucide-react';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shared/design-system/command';
import { Button } from '@/shared/design-system/button';
import { cn } from '@/shared/core/utils';
import { useResponsive } from '@/shared/app-shell/ResponsiveContext';

const appRoute = getRouteApi('/app/{-$conversationId}');

export function ModelSelector({
  currentModelId,
  onModelChange,
}: {
  currentModelId: string;
  onModelChange: (modelId: string) => void;
}) {
  const { availableModels, initialModelId } = appRoute.useLoaderData();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedModelId, setHighlightedModelId] = useState('');
  const modelListRef = useRef<HTMLDivElement>(null);
  const isMobile = useResponsive() === 'mobile';
  // 持久化优先：currentModelId 由 persist 中间件从 localStorage hydrate，已选过的模型胜出。
  // loader 的 initialModelId 仅在该浏览器从未选过模型时兜底。
  const storedIsValid = availableModels.some((m) => m.id === currentModelId);
  const selectedModelId = storedIsValid ? currentModelId : initialModelId;

  const currentModelName = availableModels.find((m) => m.id === selectedModelId)?.name ?? '';
  const getFilteredModels = (query: string) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return availableModels;

    return availableModels.filter(
      (model) =>
        model.id.toLowerCase().includes(normalizedQuery) ||
        model.name.toLowerCase().includes(normalizedQuery),
    );
  };
  const filteredModels = getFilteredModels(search);
  const modelVirtualizer = useVirtualizer({
    count: filteredModels.length,
    getScrollElement: () => modelListRef.current,
    estimateSize: () => 40,
    initialRect: { width: 0, height: 288 },
    overscan: 8,
  });

  const toolButtonBaseClass =
    'h-7 gap-1.5 rounded-full px-2.5 text-xs font-medium text-foreground hover:!text-foreground';

  return (
    <>
      <Button
        type='button'
        variant='ghost'
        size='sm'
        onClick={() => {
          setHighlightedModelId(selectedModelId);
          setOpen(true);
        }}
        aria-label={currentModelName ? `选择模型，当前为 ${currentModelName}` : '选择模型'}
        title={currentModelName || '选择模型'}
        data-testid='model-selector'
        className={cn(
          toolButtonBaseClass,
          'w-8 px-0 @[921px]:w-auto @[921px]:px-2.5 group data-[state=open]:bg-hover data-[state=open]:text-foreground',
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
      <CommandDialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setSearch('');
        }}
        label='选择模型'
      >
        <Command
          className='rounded-lg border-0'
          shouldFilter={false}
          value={highlightedModelId}
          onValueChange={setHighlightedModelId}
        >
          <CommandInput
            placeholder='搜索模型...'
            autoFocus={!isMobile}
            value={search}
            onValueChange={(query) => {
              const nextModels = getFilteredModels(query);
              setSearch(query);
              setHighlightedModelId(nextModels[0]?.id ?? '');
              modelVirtualizer.scrollToIndex(0);
            }}
            onKeyDown={(event) => {
              if (!filteredModels.length) return;

              const currentIndex = filteredModels.findIndex(
                (model) => model.id === highlightedModelId,
              );
              let nextIndex = currentIndex;

              if (event.key === 'ArrowDown') {
                nextIndex = currentIndex < filteredModels.length - 1 ? currentIndex + 1 : 0;
              } else if (event.key === 'ArrowUp') {
                nextIndex = currentIndex > 0 ? currentIndex - 1 : filteredModels.length - 1;
              } else if (event.key === 'Home') {
                nextIndex = 0;
              } else if (event.key === 'End') {
                nextIndex = filteredModels.length - 1;
              } else if (event.key === 'Enter' && currentIndex >= 0) {
                event.preventDefault();
                onModelChange(filteredModels[currentIndex].id);
                setOpen(false);
                setSearch('');
                return;
              } else {
                return;
              }

              event.preventDefault();
              setHighlightedModelId(filteredModels[nextIndex].id);
              modelVirtualizer.scrollToIndex(nextIndex, { align: 'auto' });
            }}
          />
          <CommandList
            ref={modelListRef}
            style={{
              height: filteredModels.length ? Math.min(filteredModels.length * 40, 288) : 72,
            }}
          >
            <CommandEmpty>未找到匹配的模型</CommandEmpty>
            <div className='relative w-full' style={{ height: modelVirtualizer.getTotalSize() }}>
              {modelVirtualizer.getVirtualItems().map((virtualModel) => {
                const model = filteredModels[virtualModel.index];
                if (!model) return null;

                return (
                  <CommandItem
                    key={model.id}
                    value={model.id}
                    onSelect={() => {
                      onModelChange(model.id);
                      setOpen(false);
                      setSearch('');
                    }}
                    className='absolute top-0 left-0 w-full'
                    style={{ transform: `translateY(${virtualModel.start}px)` }}
                  >
                    <span className='flex-1 truncate'>{model.name}</span>
                    {selectedModelId === model.id && <Check className='h-4 w-4 shrink-0' />}
                  </CommandItem>
                );
              })}
            </div>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
