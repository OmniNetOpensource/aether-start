import { useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { Bot, Check, ChevronDown, Loader2 } from '@/frontend/design-system/icons';
import { useToast } from '@/frontend/app-shell/useToast';
import { Button } from '@/frontend/design-system/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/frontend/design-system/command';
import { useResponsive } from '@/frontend/app-shell/ResponsiveContext';
import {
  setCurrentModelId,
  useCurrentModelId,
} from '@/frontend/conversations/session/chat-selection';
import { availableModelsQueryOptions } from '@/frontend/conversations/session/available-models-query';
import { refreshAvailableModelsFn } from '@/rpc/chat-options';
import { cn } from '@/shared/core/utils';

const appRoute = getRouteApi('/app');

export function ModelSettings({ canRefreshModels }: { canRefreshModels: boolean }) {
  const { availableModels: loaderModels } = appRoute.useLoaderData();
  const { data: availableModels } = useQuery({
    ...availableModelsQueryOptions,
    initialData: loaderModels,
  });
  const queryClient = useQueryClient();
  const toast = useToast();
  const currentModelId = useCurrentModelId();
  const deviceType = useResponsive();
  const modelListId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const modelList = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedModelId, setHighlightedModelId] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const currentModel = availableModels.find((model) => model.id === currentModelId);
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
  const selectModel = (modelId: string) => {
    setCurrentModelId(modelId);
    setExpanded(false);
    setSearch('');
    trigger.current?.focus();
  };
  const refreshModels = async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    try {
      const refreshedModels = await refreshAvailableModelsFn();
      queryClient.setQueryData(availableModelsQueryOptions.queryKey, refreshedModels);
      toast.success('Model list refreshed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to refresh models');
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <section className='space-y-3'>
      <div className='space-y-1'>
        <div className='flex items-center justify-between gap-2'>
          <h3 className='text-sm font-medium text-muted-foreground'>Model</h3>
          {canRefreshModels ? (
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={refreshModels}
              disabled={isRefreshing}
              className='h-7 px-2'
            >
              {isRefreshing ? <Loader2 className='animate-spin' /> : null}
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          ) : null}
        </div>
        <p className='text-xs text-muted-foreground'>
          Used for the next message and saved with this conversation after sending.
        </p>
      </div>
      <div className='overflow-hidden rounded-lg border bg-muted'>
        <Button
          ref={trigger}
          type='button'
          variant='ghost'
          onClick={() => {
            if (expanded) {
              setExpanded(false);
              setSearch('');
              return;
            }

            setHighlightedModelId(currentModel?.id ?? '');
            setExpanded(true);
          }}
          aria-label={
            currentModel
              ? `Choose model, current model is ${currentModel.name}`
              : currentModelId
                ? `Choose model, current model is unavailable: ${currentModelId}`
                : 'Choose model, no model selected'
          }
          aria-expanded={expanded}
          aria-controls={modelListId}
          className='h-auto w-full justify-between rounded-none px-3 py-3 text-left hover:bg-hover'
        >
          <span className='flex min-w-0 items-center gap-3'>
            <Bot className='h-4 w-4 shrink-0 text-muted-foreground' />
            <span className='min-w-0'>
              <span className='block truncate text-sm font-medium text-foreground'>
                {currentModel?.name ??
                  (currentModelId ? 'Current model unavailable' : 'No model selected')}
              </span>
              <span className='block truncate text-xs font-normal text-muted-foreground'>
                {currentModel ? currentModel.id : currentModelId || 'Choose a model before sending'}
              </span>
            </span>
          </span>
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 transition-transform', expanded && 'rotate-180')}
          />
        </Button>

        {expanded ? (
          <Command
            id={modelListId}
            className='rounded-none border-t bg-background'
            shouldFilter={false}
            value={highlightedModelId}
            onValueChange={setHighlightedModelId}
          >
            <CommandInput
              aria-label='Search models'
              placeholder='Search models...'
              autoFocus={deviceType === 'desktop'}
              value={search}
              onValueChange={(query) => {
                setSearch(query);
                setHighlightedModelId(filterModels(query)[0]?.id ?? '');
                modelList.current?.scrollTo({ top: 0 });
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
                } else if (event.key === 'Enter' && currentIndex >= 0) {
                  event.preventDefault();
                  selectModel(filteredModels[currentIndex].id);
                  return;
                } else {
                  return;
                }

                event.preventDefault();
                const nextModelId = filteredModels[nextIndex].id;
                setHighlightedModelId(nextModelId);
                queueMicrotask(() => {
                  modelList.current
                    ?.querySelector<HTMLElement>(`[data-value="${CSS.escape(nextModelId)}"]`)
                    ?.scrollIntoView({ block: 'nearest' });
                });
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
              {!filteredModels.length && (
                <CommandEmpty aria-live='polite'>No matching models.</CommandEmpty>
              )}
              {filteredModels.map((model) => (
                <CommandItem
                  key={model.id}
                  value={model.id}
                  data-value={model.id}
                  aria-current={currentModelId === model.id ? 'true' : undefined}
                  onSelect={() => selectModel(model.id)}
                >
                  <span className='flex-1 truncate'>{model.name}</span>
                  {currentModelId === model.id ? <Check className='h-4 w-4 shrink-0' /> : null}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        ) : null}
      </div>
    </section>
  );
}
