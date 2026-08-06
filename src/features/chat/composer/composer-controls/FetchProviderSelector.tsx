import { Check, ChevronDown, Globe } from '@/shared/design-system/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/design-system/dropdown-menu';
import { Button } from '@/shared/design-system/button';
import { cn } from '@/shared/core/utils';
import { For } from 'solid-js';
import {
  currentFetchProvider,
  setCurrentFetchProvider,
} from '@/features/conversations/session/chat-selection';

const PROVIDERS = [
  { id: 'jina' as const, name: 'Jina' },
  { id: 'firecrawl' as const, name: 'Firecrawl' },
  { id: 'exa' as const, name: 'Exa' },
];

export function FetchProviderSelector() {
  const currentName = () =>
    PROVIDERS.find((provider) => provider.id === currentFetchProvider())?.name ?? 'Jina';

  return (
    <DropdownMenu positioning={{ placement: 'bottom-start', gutter: 4 }}>
      <DropdownMenuTrigger
        asChild={(triggerProps) => (
          <Button
            {...triggerProps}
            type='button'
            variant='ghost'
            size='sm'
            aria-label={`选择抓取服务，当前为 ${currentName()}`}
            title={`Fetch: ${currentName()}`}
            class={cn(
              'h-7 gap-1.5 rounded-full px-2.5 text-xs font-medium text-foreground hover:!text-foreground',
              'w-8 px-0 @[921px]:w-auto @[921px]:px-2.5 group data-[state=open]:bg-hover data-[state=open]:text-foreground',
            )}
          >
            <Globe class='h-3.5 w-3.5' />
            <span class='hidden @[921px]:inline-flex items-center gap-1.5'>
              <span class='max-w-20 truncate'>{currentName()}</span>
              <ChevronDown class='h-3 w-3 transition-transform duration-300' />
            </span>
          </Button>
        )}
      />
      <DropdownMenuContent>
        <For each={PROVIDERS}>
          {(provider) => (
            <DropdownMenuItem
              value={provider.id}
              onSelect={() => setCurrentFetchProvider(provider.id)}
            >
              <span class='flex-1 truncate'>{provider.name}</span>
              {currentFetchProvider() === provider.id && <Check class='h-4 w-4 shrink-0' />}
            </DropdownMenuItem>
          )}
        </For>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
