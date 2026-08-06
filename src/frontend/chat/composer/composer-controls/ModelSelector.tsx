import { For, createSignal } from 'solid-js';
import { getRouteApi } from '@tanstack/solid-router';
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
import { currentModelId, setCurrentModelId } from '@/frontend/conversations/session/chat-selection';

const appRoute = getRouteApi('/app');

export function ModelSelector() {
  const loaderData = appRoute.useLoaderData();
  const availableModels = () => loaderData().availableModels;
  const [open, setOpen] = createSignal(false);
  const [search, setSearch] = createSignal('');
  const [highlightedModelId, setHighlightedModelId] = createSignal('');
  const deviceType = useResponsive();
  let modelList: HTMLDivElement | undefined;

  const selectedModelId = () =>
    availableModels().some((model) => model.id === currentModelId())
      ? currentModelId()
      : loaderData().initialModelId;
  const currentModelName = () =>
    availableModels().find((model) => model.id === selectedModelId())?.name ?? '';
  const filteredModels = () => {
    const normalizedQuery = search().trim().toLowerCase();
    if (!normalizedQuery) return availableModels();
    return availableModels().filter(
      (model) =>
        model.id.toLowerCase().includes(normalizedQuery) ||
        model.name.toLowerCase().includes(normalizedQuery),
    );
  };
  const highlight = (modelId: string) => {
    setHighlightedModelId(modelId);
    queueMicrotask(() => {
      modelList
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
          setHighlightedModelId(selectedModelId());
          setOpen(true);
        }}
        aria-label={currentModelName() ? `选择模型，当前为 ${currentModelName()}` : '选择模型'}
        title={currentModelName() || '选择模型'}
        data-testid='model-selector'
        class={cn(
          'h-7 gap-1.5 rounded-full px-2.5 text-xs font-medium text-foreground hover:!text-foreground',
          'w-8 px-0 @[921px]:w-auto @[921px]:px-2.5 group data-[state=open]:bg-hover data-[state=open]:text-foreground',
        )}
      >
        <span class='flex @[921px]:hidden'>
          <svg
            xmlns='http://www.w3.org/2000/svg'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            stroke-width='2'
            stroke-linecap='round'
            stroke-linejoin='round'
            class='h-3.5 w-3.5'
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
        <span class='hidden @[921px]:flex items-center gap-1.5'>
          <span class='max-w-40 truncate'>{currentModelName()}</span>
          <svg
            xmlns='http://www.w3.org/2000/svg'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            stroke-width='2'
            stroke-linecap='round'
            stroke-linejoin='round'
            class='h-3 w-3 transition-transform duration-300'
            aria-hidden='true'
          >
            <path d='m6 9 6 6 6-6' />
          </svg>
        </span>
      </Button>
      <CommandDialog
        open={open()}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setSearch('');
        }}
        label='选择模型'
      >
        <Command
          class='rounded-lg border-0'
          shouldFilter={false}
          value={highlightedModelId()}
          onValueChange={setHighlightedModelId}
        >
          <CommandInput
            placeholder='搜索模型...'
            autofocus={deviceType() !== 'mobile'}
            value={search()}
            onValueChange={(query) => {
              setSearch(query);
              setHighlightedModelId(filteredModels()[0]?.id ?? '');
              modelList?.scrollTo({ top: 0 });
            }}
            onKeyDown={(event) => {
              const models = filteredModels();
              if (!models.length) return;
              const currentIndex = models.findIndex((model) => model.id === highlightedModelId());
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
            ref={(element) => {
              modelList = element;
            }}
            style={{
              height: filteredModels().length
                ? `${Math.min(filteredModels().length * 40, 288)}px`
                : '72px',
            }}
          >
            {!filteredModels().length && <CommandEmpty>未找到匹配的模型</CommandEmpty>}
            <For each={filteredModels()}>
              {(model) => (
                <CommandItem
                  value={model.id}
                  data-value={model.id}
                  onSelect={() => selectModel(model.id)}
                >
                  <span class='flex-1 truncate'>{model.name}</span>
                  {selectedModelId() === model.id && <Check class='h-4 w-4 shrink-0' />}
                </CommandItem>
              )}
            </For>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
