import { useRef, useState } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import { Check } from '@/frontend/design-system/icons';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/frontend/design-system/command';
import { Button } from '@/frontend/design-system/button';
import { cn } from '@/shared/core/utils';
import { useResponsive } from '@/frontend/app-shell/ResponsiveContext';
import {
  setCurrentModelId,
  useCurrentModelId,
} from '@/frontend/conversations/session/chat-selection';

const appRoute = getRouteApi('/app');

export function ModelSelector() {
  const loaderData = appRoute.useLoaderData();
  const availableModels: { id: string; name: string }[] = loaderData.availableModels;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedModelId, setHighlightedModelId] = useState('');
  const deviceType = useResponsive();
  const currentModelId = useCurrentModelId();
  const modelList = useRef<HTMLDivElement>(null);

  const selectedModelId = availableModels.some((model) => model.id === currentModelId)
    ? currentModelId
    : availableModels[0]?.id;
  const currentModelName =
    availableModels.find((model) => model.id === selectedModelId)?.name ?? '';
  const filterModels = (query: string) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return availableModels;
    return availableModels.filter(
      (model) =>
        model.id.toLowerCase().includes(normalizedQuery) ||
        model.name.toLowerCase().includes(normalizedQuery),
    );
  };
  const filteredModels = filterModels(search);
  const highlight = (modelId: string) => {
    setHighlightedModelId(modelId);
    queueMicrotask(() => {
      modelList.current
        ?.querySelector<HTMLElement>(`[data-value="${CSS.escape(modelId)}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    });
  };
  const selectModel = (modelId: string) => {
    setCurrentModelId(modelId);
    setOpen(false);
    setSearch('');
  };

  return (
    <>
      <Button
        type='button'
        variant='ghost'
        size='sm'
        onClick={() => {
          setHighlightedModelId(selectedModelId ?? '');
          setOpen(true);
        }}
        aria-label={currentModelName ? `选择模型，当前为 ${currentModelName}` : '选择模型'}
        title={currentModelName || '选择模型'}
        data-testid='model-selector'
        className={cn(
          'h-7 gap-1.5 rounded-full px-2.5 text-xs font-medium text-foreground hover:!text-foreground',
          'w-8 px-0 @[921px]:w-auto @[921px]:px-2.5 group data-[state=open]:bg-hover data-[state=open]:text-foreground',
        )}
      >
        <span className='flex @[921px]:hidden'>
          <svg
            xmlns='http://www.w3.org/2000/svg'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
            className='h-3.5 w-3.5'
            aria-hidden='true'
          >
            <path d='M12 8V4H8' />
            <rect width='16' height='12' x='4' y='8' rx='2' />
            <path d='M2 14h2' />
            <path d='M20 14h2' />
            <path d='M15 13v2' />
            <path d='M9 13v2' />
          </svg>
        </span>
        <span className='hidden @[921px]:flex items-center gap-1.5'>
          <span className='max-w-40 truncate'>{currentModelName}</span>
          <svg
            xmlns='http://www.w3.org/2000/svg'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
            className='h-3 w-3 transition-transform duration-300'
            aria-hidden='true'
          >
            <path d='m6 9 6 6 6-6' />
          </svg>
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
            autoFocus={deviceType !== 'mobile'}
            value={search}
            onValueChange={(query) => {
              setSearch(query);
              setHighlightedModelId(filterModels(query)[0]?.id ?? '');
              modelList.current?.scrollTo({ top: 0 });
            }}
            onKeyDown={(event) => {
              const models = filteredModels;
              if (!models.length) return;
              const currentIndex = models.findIndex((model) => model.id === highlightedModelId);
              let nextIndex = currentIndex;

              if (event.key === 'ArrowDown') {
                nextIndex = currentIndex < models.length - 1 ? currentIndex + 1 : 0;
              } else if (event.key === 'ArrowUp') {
                nextIndex = currentIndex > 0 ? currentIndex - 1 : models.length - 1;
              } else if (event.key === 'Home') {
                nextIndex = 0;
              } else if (event.key === 'End') {
                nextIndex = models.length - 1;
              } else if (event.key === 'Enter' && currentIndex >= 0) {
                event.preventDefault();
                selectModel(models[currentIndex].id);
                return;
              } else {
                return;
              }

              event.preventDefault();
              highlight(models[nextIndex].id);
            }}
          />
          <CommandList
            ref={modelList}
            style={{
              height: filteredModels.length
                ? `${Math.min(filteredModels.length * 40, 288)}px`
                : '72px',
            }}
          >
            {!filteredModels.length && <CommandEmpty>未找到匹配的模型</CommandEmpty>}
            {filteredModels.map((model) => (
              <CommandItem
                key={model.id}
                value={model.id}
                data-value={model.id}
                onSelect={() => selectModel(model.id)}
              >
                <span className='flex-1 truncate'>{model.name}</span>
                {selectedModelId === model.id && <Check className='h-4 w-4 shrink-0' />}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
